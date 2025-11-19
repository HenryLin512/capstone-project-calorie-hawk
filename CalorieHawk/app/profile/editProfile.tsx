import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { auth, db, storage } from "../../FireBaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { router } from "expo-router";

import { Profile } from "../../types/Profile"; // adjust path if needed

export default function EditProfileScreen() {
  const user = auth.currentUser;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);

  // Load current profile
  const loadProfile = async () => {
    if (!user) return;

    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data() as Profile;
      setProfile(data);
      setNewName(data.displayName || "");
      setNewPhoto(data.photoURL || null);
    } else {
      Alert.alert("Error", "Profile not found.");
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Pick new profile picture
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6, // compress
    });

    if (!result.canceled) {
      setNewPhoto(result.assets[0].uri);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!user) return;

    setLoading(true);

    let photoURL = profile?.photoURL || null;

    // Upload new profile image if changed
    if (newPhoto && newPhoto !== profile?.photoURL) {
      const storageRef = ref(storage, `profilePics/${user.uid}.jpg`);
      const response = await fetch(newPhoto);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob);
      photoURL = await getDownloadURL(storageRef);
    }

    await updateDoc(doc(db, "users", user.uid), {
      displayName: newName || profile?.displayName,
      photoURL: photoURL,
    });

    Alert.alert("Success", "Profile updated!");
    router.back(); // go back after saving
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Edit Profile</Text>

      <TouchableOpacity onPress={pickImage}>
        {newPhoto ? (
          <Image source={{ uri: newPhoto }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>+</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Username</Text>
      <TextInput
        style={styles.input}
        value={newName}
        onChangeText={setNewName}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveText}>Save Changes</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  container: { flex: 1, padding: 20, backgroundColor: "#fff" },

  header: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 20,
  },

  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignSelf: "center",
    marginBottom: 20,
  },

  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },

  avatarText: { fontSize: 40, color: "#666" },

  label: { fontSize: 16, fontWeight: "600", marginTop: 10 },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginTop: 5,
    fontSize: 16,
  },

  saveBtn: {
    backgroundColor: "#6C47FF",
    padding: 15,
    borderRadius: 12,
    marginTop: 30,
  },

  saveText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
});
