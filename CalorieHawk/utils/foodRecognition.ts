import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import Constants from 'expo-constants';



async function safeGetApiKey() {
  try {
    const response = await fetch("https://getapikey-jrksbss7cq-uc.a.run.app");
    const data = await response.text();
    return data;
  } catch (err) {
    console.error("Safe fetch failed:", err);
    return undefined;
  }
}


// Read Clarifai PAT/API key from Expo config (extra) or environment. Prefer PAT for public clarifai/main access.
const EXPO_EXTRA = (Constants.manifest as any)?.extra ?? (Constants as any)?.expoConfig?.extra;

let CLARIFAI_PAT = "";

async function init() {
  const API = await safeGetApiKey();
  if (API) {
    CLARIFAI_PAT = API;
    //console.log("CLARIFAI_PAT set to:", CLARIFAI_PAT);
  } else {
    //console.error("Failed to get API key");
  }
}

init();


// Clarifai public app + model (stable version id recommended by Clarifai docs)
const CLARIFAI_USER_ID = 'clarifai';
const CLARIFAI_APP_ID = 'main';
const CLARIFAI_MODEL_ID = 'food-item-recognition';
const CLARIFAI_MODEL_VERSION_ID = '1d5fd481e0cf4826aa72ec3ff049e044';

type Concept = { id?: string; name: string; value: number };
type ScanResult = { concepts?: Concept[] } | null;

/**
 * scanFood
 * - If `imageUrl` is provided, it will call Clarifai with the URL.
 * - Otherwise it will open the camera, obtain a base64 image, and call Clarifai with that.
 */
export async function scanFood(options?: { imageUrl?: string }): Promise<ScanResult> {
  try {
    if (!CLARIFAI_PAT) {
      console.warn('Missing CLARIFAI_PAT. Set it via expo config (extra) or environment variable.');
      Alert.alert(
        'Missing Clarifai Token',
        'Clarifai PAT is not configured. Set CLARIFAI_PAT in your environment or app config.'
      );
      return null;
    }

  let body: any;

    if (options?.imageUrl) {
      // Use the uploaded image URL (preferred to avoid double-camera UX)
  body = { inputs: [{ data: { image: { url: options.imageUrl } } }] };
    } else {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Access Needed', 'Please enable camera permissions to scan food.');
        return null;
      }

      // Launch camera to capture base64
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        base64: true,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]?.base64) return null;
      const base64 = result.assets[0].base64;
      body = { inputs: [{ data: { image: { base64 } } }] };
    }
    // Ensure we reference the public Clarifai app where this model lives
    const payload = {
      user_app_id: { user_id: CLARIFAI_USER_ID, app_id: CLARIFAI_APP_ID },
      ...body,
    };

    const url = `https://api.clarifai.com/v2/models/${CLARIFAI_MODEL_ID}/versions/${CLARIFAI_MODEL_VERSION_ID}/outputs`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Key ${CLARIFAI_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Clarifai error:', resp.status, txt);
      if (resp.status === 401) {
        Alert.alert('Authentication Error', 'Clarifai returned 401 — check your API key (expired/revoked).');
      } else {
        Alert.alert('Recognition Error', 'Could not analyze image. Try again.');
      }
      return null;
    }

  const json = await resp.json();
  const concepts: Concept[] = json?.outputs?.[0]?.data?.concepts ?? [];
  if (!concepts.length) return null;

  return { concepts };
  } catch (err) {
    console.error('scanFood error:', err);
    Alert.alert('Error', 'Could not scan food. Please try again.');
    return null;
  }
}
