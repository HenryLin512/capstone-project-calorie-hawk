import { View, Text, Image, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../FireBaseConfig";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";

export default function ProfileScreen() {
  const { uid } = useLocalSearchParams();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "users", String(uid)));
      setProfile(snap.data());
    })();
  }, []);

  if (!profile) return <Text>Loading...</Text>;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Profile",
        }}
      />

      <View style={styles.container}>
        {profile.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
        ) : null}

        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.uid}>{uid}</Text>
      </View>
    </>
  );
}



const styles = StyleSheet.create({
  container: { alignItems: "center", padding: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  name: { fontSize: 22, fontWeight: "700", marginTop: 10 },
  uid: { fontSize: 12, color: "#888", marginTop: 4 },
});