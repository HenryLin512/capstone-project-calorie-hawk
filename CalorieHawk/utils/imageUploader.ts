/**
 * utils/imageUploader.ts
 * -----------------------
 * Handles picking an image from the media library,
 * uploading it to Firebase Storage, and saving metadata.
 *
 * Fixed:
 *  - serverTimestamp() is only used at the top level (allowed)
 *  - ArrayUnion entries use Date.now() instead
 *  - More user feedback for permission and upload
 */

import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage, auth, db } from '../FireBaseConfig';
import { doc, setDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import dayjs from 'dayjs';

/**
 * Opens gallery picker, uploads image to Firebase Storage,
 * and saves photo metadata (URL + meal + timestamp) to Firestore.
 */
export async function pickUploadAndSaveMeta(meal?: string): Promise<string | null> {
  try {
    /**
     * 🔹 Step 1: Request photo library permission
     */
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Photo Access Needed',
        'Please enable photo permissions in Settings so you can upload meal images.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return null;
    }

    /**
     * 🔹 Step 2: Launch image picker
     */
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) {
      console.log('User cancelled image picker.');
      return null;
    }

    const imageUri = result.assets[0].uri;

    /**
     * 🔹 Step 3: Upload image to Firebase Storage
     */
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user');

    const fileName = `${dayjs().format('YYYYMMDD_HHmmss')}.jpg`;
    const storageRef = ref(storage, `images/${user.uid}/${fileName}`);

    const response = await fetch(imageUri);
    const blob = await response.blob();

    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);

    /**
     * 🔹 Step 4: Save metadata to Firestore
     *
     * Important: Firestore doesn't allow serverTimestamp() inside arrayUnion().
     * So, we store Date.now() inside the array, and serverTimestamp() at root.
     */
    const todayKey = dayjs().format('YYYY-MM-DD');
    const dayDocRef = doc(db, 'users', user.uid, 'photos', todayKey);

    await setDoc(
      dayDocRef,
      {
        date: todayKey,
        lastUpdated: serverTimestamp(), // ✅ allowed at root level
        photos: arrayUnion({
          url: downloadURL,
          meal: meal || 'Unknown',
          uploadedAt: Date.now(), // ✅ use client timestamp instead
        }),
      },
      { merge: true }
    );

    console.log('✅ Image uploaded & metadata saved:', downloadURL);
    return downloadURL;
  } catch (err) {
    console.error('❌ Image upload failed:', err);
    Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
    return null;
  }
}