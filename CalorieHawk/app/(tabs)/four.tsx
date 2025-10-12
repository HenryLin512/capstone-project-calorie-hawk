import { 
  StyleSheet, 
  Image, 
  FlatList, 
  Alert, 
  TouchableOpacity, 
  Text, 
  View 
} from "react-native";
import React, { useState, useEffect } from "react";
import { storage, auth } from "../../FireBaseConfig";
import { 
  getDownloadURL, 
  ref, 
  uploadBytes, 
  listAll, 
  deleteObject 
} from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import { User, onAuthStateChanged } from "firebase/auth";

export default function TabThreeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchImages(currentUser.uid);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch images for the logged-in user
  const fetchImages = async (userId: string) => {
    try {
      const storageRef = ref(storage, `images/${userId}`);
      const result = await listAll(storageRef);
      const urls = await Promise.all(
        result.items.map((itemRef) => getDownloadURL(itemRef))
      );
      setImages(urls);
    } catch (error) {
      console.error("❌ Error fetching images: ", error);
    }
  };

  // Pick an image from gallery
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, // ✅ still supported
      allowsEditing: false,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const imageUri = result.assets[0].uri;
      setImage(imageUri);
      console.log("📸 Image picked: ", imageUri);
    }
  };

  // Upload image to Firebase Storage
  const uploadImage = async () => {
    if (!user || !image) {
      Alert.alert("Error", "No user or image found!");
      return;
    }

    try {
      console.log("⬆️ Uploading image: ", image);

      // Convert local file URI → Blob
      const response = await fetch(image);
      const blob = await response.blob();

      // Create a storage reference
      const storageRef = ref(storage, `images/${user.uid}/${Date.now()}.jpg`);

      // Upload
      await uploadBytes(storageRef, blob);

      // Get download URL
      const url = await getDownloadURL(storageRef);
      setImages((prev) => [...prev, url]);
      setImage(null);

      console.log("✅ Upload complete: ", url);
    } catch (error: any) {
      console.error("❌ Error uploading image: ", error);
      Alert.alert("Upload failed", error.message);
    }
  };

  // Delete image from Firebase Storage
  const deleteImage = async (url: string) => {
    if (!user) {
      Alert.alert("Error", "No user found!");
      return;
    }

    try {
      // Extract Firebase storage path from full URL
      const path = url.split("/o/")[1].split("?")[0];
      const decodedPath = decodeURIComponent(path);

      const storageRef = ref(storage, decodedPath);
      await deleteObject(storageRef);

      setImages((prev) => prev.filter((img) => img !== url));
      console.log("🗑️ Deleted: ", url);
    } catch (error: any) {
      console.error("❌ Error deleting image: ", error);
      Alert.alert("Delete failed", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Storage</Text>

      <TouchableOpacity style={styles.button} onPress={pickImage}>
        <Text style={styles.buttonText}>Pick an image from camera roll</Text>
      </TouchableOpacity>

      {image && (
        <>
          <Image source={{ uri: image }} style={styles.image} />
          <TouchableOpacity style={styles.button} onPress={uploadImage}>
            <Text style={styles.buttonText}>Upload Image</Text>
          </TouchableOpacity>
        </>
      )}

      <FlatList
        data={images}
        renderItem={({ item }) => (
          <View style={styles.imageContainer}>
            <Image source={{ uri: item }} style={styles.image} />
            <TouchableOpacity
              style={styles.button}
              onPress={() => deleteImage(item)}
            >
              <Text style={styles.buttonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        keyExtractor={(item, index) => index.toString()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  image: {
    width: 200,
    height: 200,
    marginVertical: 10,
  },
  imageContainer: {
    alignItems: "center",
    marginVertical: 10,
  },
  button: {
    padding: 10,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5C6BC0",
    marginTop: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

