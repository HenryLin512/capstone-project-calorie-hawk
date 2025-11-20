import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../FireBaseConfig";

export async function createUserProfile(user: any) {
  if (!user) return;

  const uid = user.uid;
  const email = user.email;

  // Generate default username from email
  let defaultUsername = "user" + uid.slice(0, 5);
  if (email) {
    const nameFromEmail = email.split("@")[0];
    if (nameFromEmail.length >= 3) {
      defaultUsername = nameFromEmail;
    }
  }

  // Default profile picture
  const defaultPhotoURL =
    "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  await setDoc(doc(db, "users", uid), {
    uid,
    email,
    displayName: defaultUsername,
    photoURL: defaultPhotoURL,
    createdAt: serverTimestamp(),
  });
}