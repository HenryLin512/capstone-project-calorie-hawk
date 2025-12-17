// app/(tabs)/CommunityTab.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Share,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  collection,
  onSnapshot,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  DocumentData,
} from "firebase/firestore";
import { db, storage } from "../../FireBaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "../../FireBaseConfig";
import { useTheme } from "../../utils/ThemeContext";



/* ----------------------
   Types
------------------------*/
type RecipeDoc = {
  id: string;
  title: string;
  author: string; // visible name
  authorId?: string | null; // optional user id (if you later add auth)
  description: string;
  imageUrl?: string;
  calories?: number;
  createdAt?: any;
  likes?: number;
  likedBy?: string[]; // optional array of uids or usernames
  comments?: string[]; // simple array of comment texts (could be expanded to objects)
};

export type Profile = {
  uid: string;
  displayName?: string;
  photoURL?: string | null;
};

/* ----------------------
   Helpers
------------------------*/
function timeAgo(date?: Date | null) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
}

/* ShortText component with read-more */
const ShortText: React.FC<{ text: string; limit?: number }> = ({ text, limit = 180 }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > limit;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => isLong && setExpanded((s) => !s)}>
      <Text style={styles.desc}>
        {expanded || !isLong ? text : text.slice(0, limit) + "…"}
      </Text>
      {!expanded && isLong && <Text style={styles.readMore}>Read more</Text>}
      {expanded && isLong && <Text style={styles.readMore}>Read less</Text>}
    </TouchableOpacity>
  );
};

/* ----------------------
   Main Component
------------------------*/
export default function CommunityTab() {
  const [posts, setPosts] = useState<RecipeDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // profiles lookup: key by uid and by username (if present)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  // post creation state
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState(""); // user-entered name for now
  const [description, setDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  // comment state (per-post)
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);
  const { theme, mode } = useTheme();
  

  /* ----------------------
     Real-time posts listener
  ------------------------*/
  useEffect(() => {
    const q = query(collection(db, "recipes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: RecipeDoc[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;
          list.push({
            id: docSnap.id,
            title: data.title || "",
            author: data.author || "",
            authorId: data.authorId || null,
            description: data.description || "",
            imageUrl: data.imageUrl || null,
            calories: data.calories || 0,
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
            likes: data.likes ?? 0,
            likedBy: data.likedBy ?? [],
            comments: data.comments ?? [],
          });
        });
        setPosts(list);
        setLoading(false);
      },
      (err) => {
        console.error("Posts listener error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* ----------------------
     Fetch user profiles lookup (small cache)
     - We fetch once here. If you want live profiles, convert to onSnapshot as well.
  ------------------------*/
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const map: Record<string, Profile> = {};
        snap.forEach((d) => {
          const data = d.data() as any;
          const uid = d.id;
          map[uid] = {
            uid,
            //username: data.username,
            displayName: data.displayName ?? data.username ?? data.name,
            photoURL: data.photoURL ?? data.avatarUrl ?? null,
          };
          // also map by username key (if exists)
          if (data.username) map[data.username] = map[uid];
        });
        if (mounted) setProfiles(map);
      } catch (e) {
        console.warn("Failed to fetch profiles:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ----------------------
     Image picking + compression
  ------------------------*/
  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission required", "Please allow photo access.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (!result.canceled) {
        let uri = result.assets[0].uri;
        // compress/resize
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }], // keep large but bounded
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        setImageUri(compressed.uri);
      }
    } catch (err) {
      console.error("pickImage error:", err);
    }
  };

  /* ----------------------
     Upload compressed image and return download URL
  ------------------------*/
  const uploadImageAsync = async (localUri: string) => {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const path = `recipes/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, blob);
    const url = await getDownloadURL(imageRef);
    return url;
  };

  /* ----------------------
     Create post
  ------------------------*/
  const handlePost = async () => {
    if (!title.trim() || !author.trim() || !description.trim() || !calories.trim()) {
      Alert.alert("Missing fields", "Please fill all fields.");
      return;
    }
    try {
      let imageUrl = '';
      if (imageUri) {
        const imageRef = ref(storage, `recipes/${Date.now()}.jpg`);
        const response = await fetch(imageUri);
        const blob = await response.blob();
        await uploadBytes(imageRef, blob);
        imageUrl = await getDownloadURL(imageRef);
      }

      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "You must be logged in to post.");
        return;
      }

      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const profile = profileSnap.data();

      await addDoc(collection(db, "recipes"), {
        title,
        description,
        imageUrl,
        calories: Number(calories),

        // NEW PROFILE FIELDS
        authorId: user.uid,
        authorName: profile?.displayName || "Anonymous",
        authorPhoto: profile?.photoURL || null,

        createdAt: serverTimestamp(),
      });

      // reset
      setTitle("");
      setAuthor("");
      setDescription("");
      setCalories("");
      setImageUri(null);
      setModalVisible(false);
      // real-time listener will update posts
    } catch (e) {
      console.error("post error", e);
      Alert.alert("Error", "Failed to create post.");
    }
  };

  /* ----------------------
     Like / Unlike - toggle by saving username in likedBy (since no auth)
     We'll use the provided author name as a unique identifier for now (not secure).
     When you add auth, replace `viewerId` with currentUser.uid
  ------------------------*/
  const toggleLike = async (post: RecipeDoc) => {
    try {
      const postRef = doc(db, "recipes", post.id);
      const viewerId = "local-demo-user"; // temporary placeholder — change to uid when you add auth

      const already = Array.isArray(post.likedBy) && post.likedBy.includes(viewerId);
      if (already) {
        await updateDoc(postRef, {
          likedBy: arrayRemove(viewerId),
          likes: increment(-1),
        });
      } else {
        await updateDoc(postRef, {
          likedBy: arrayUnion(viewerId),
          likes: increment(1),
        });
      }
      // realtime will update UI
    } catch (e) {
      console.error("like error", e);
    }
  };

  /* ----------------------
     Comments: view / add
     We'll save comments as simple objects in array like "username:commentText" to preserve who posted.
     (You can later upgrade to comment objects with timestamp and uid).
  ------------------------*/
  const submitComment = async (postId: string) => {
    const text = (commentText[postId] || "").trim();
    if (!text) return;
    try {
      const postRef = doc(db, "recipes", postId);
      // for now store "LocalUser: comment text"
      const commenter = "LocalUser"; // replace with auth when available
      const commentPayload = `${commenter}: ${text}`;
      await updateDoc(postRef, {
        comments: arrayUnion(commentPayload),
      });
      setCommentText((s) => ({ ...s, [postId]: "" }));
      // real-time will refresh comment list
    } catch (e) {
      console.error("comment error", e);
    }
  };

  /* ----------------------
     Helpers for profile lookup display
  ------------------------*/
  const findProfileForPost = (post: RecipeDoc) => {
    if (post.authorId && profiles[post.authorId]) return profiles[post.authorId];
    // try by username match
    if (post.author && profiles[post.author]) return profiles[post.author];
    // fallback to simple object constructed from author string
    return { uid: "local:" + post.author, displayName: post.author, photoURL: null } as Profile;
  };

  /* ----------------------
     Render
  ------------------------*/
  if (loading) {
    return (
      <View style={[styles.centered,{ backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
        <Text style={{ color: theme.text}}>Loading feed...</Text>
      </View>
    );
  }

  /* ----------------------
     SharePost
  ------------------------*/
  const sharePost = async (item: RecipeDoc) => {
  try {
    const message =
      `${item.title}\n\n${item.description}` +
      `\n\nCalories: ${item.calories ?? 0} kcal` +
      (item.imageUrl ? `\n\nImage: ${item.imageUrl}` : "");

    await Share.share({
      message,
      title: item.title,
    });
  } catch (error) {
    Alert.alert("Error", "Failed to share post.");
  }
};

  return (
    <View style={{ flex: 1 , backgroundColor: theme.background }}>
      <FlatList
        data={posts}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => {
          const profile = findProfileForPost(item);
          const postTime = item.createdAt ? timeAgo(item.createdAt as Date) : "";
          const commentCount = Array.isArray(item.comments) ? item.comments.length : 0;
          const likedByViewer = Array.isArray(item.likedBy) && item.likedBy.includes("local-demo-user");
          return (
            <View style={[styles.card, {backgroundColor: mode === "dark" ? theme.card : "#fff" }]}>
              {/* header: profile pic + name + time */}
              <View style={styles.headerRow}>
                {profile.photoURL ? (
                  <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={[styles.avatarInitial, { color: theme.text }]}>
                      {(profile.displayName || "U").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.displayName, { color: theme.text }]}>{profile.displayName}</Text>
                  <Text style={[styles.timeText, { color: theme.text }]}>{postTime}</Text>
                </View>
              </View>

              <Text style={[styles.postTitle, { color: theme.text }]}>{item.title}</Text>

              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.postImage} />
              ) : null}

              <ShortText text={item.description} />

              <Text style={[styles.calories, { color: theme.tint }]}>{item.calories ?? 0} kcal</Text>

              {/* action bar */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(item)}>
                  <Text style={[styles.actionText, likedByViewer && { color: "#e0245e" }]}>
                    {likedByViewer ? "❤️" : "🤍"} {item.likes ?? 0}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() =>
                    setExpandedComments((s) => ({ ...s, [item.id]: !s[item.id] }))
                  }
                >
                  <Text style={styles.actionText}>💬 {commentCount}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={() => sharePost(item)}>
                  <Text style={styles.actionText}>↗ Share</Text>
                </TouchableOpacity>
              </View>

              {/* Comments area (collapsed by default) */}
              {expandedComments[item.id] ? (
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : "height"}
                  keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
                  style={{ maxHeight: 350 }}
                >
                  <ScrollView
                    ref={scrollRef}
                    onContentSizeChange={() =>
                      scrollRef.current?.scrollToEnd({ animated: true })
                    }
                    style={styles.commentsSection}
                  >
                    {commentCount === 0 ? (
                      <Text style={styles.noComments}>No comments yet — be the first!</Text>
                    ) : (
                      (item.comments || []).map((c, idx) => {
                        const parts = String(c).split(": ");
                        const commenterName = parts.shift() || "User";
                        const commentBody = parts.join(": ");
                        const commenterProfile = profiles[commenterName] ?? null;

                        return (
                          <View key={idx} style={styles.commentRow}>
                            {commenterProfile?.photoURL ? (
                              <Image
                                source={{ uri: commenterProfile.photoURL }}
                                style={styles.commentAvatar}
                              />
                            ) : (
                              <View style={styles.commentAvatarPlaceholder}>
                                <Text style={styles.commentAvatarInitial}>
                                  {commenterName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}

                            <View style={{ flex: 1 }}>
                              <Text style={styles.commentAuthor}>{commenterName}</Text>
                              <ShortText text={commentBody} limit={120} />
                            </View>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>

                  {/* Comment input */}
                  <View style={styles.addCommentRow}>
                    <TextInput
                      placeholder="Write a comment..."
                      value={commentText[item.id] ?? ""}
                      onChangeText={(t) => {
                        setCommentText((s) => ({ ...s, [item.id]: t }));
                        setTimeout(() => {
                          scrollRef.current?.scrollToEnd({ animated: true });
                        }, 50);
                      }}
                      style={styles.commentInput}
                      multiline
                    />

                    <TouchableOpacity
                      style={styles.commentPostBtn}
                      onPress={() => submitComment(item.id)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Post</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <TouchableOpacity
                  onPress={() => setExpandedComments((s) => ({ ...s, [item.id]: true }))}
                  style={{ paddingTop: 8 }}
                >
                  <Text style={styles.viewComments}>View comments ({commentCount})</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Floating Add Button */}
      <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.tint }]} onPress={() => setModalVisible(true)}>
        <Text style={styles.addButtonText}>＋</Text>
      </TouchableOpacity>

      {/* New post modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView>
              <Text style={styles.modalTitle}>Create a Post</Text>

              <TextInput placeholder="Title" style={styles.input} value={title} onChangeText={setTitle} />
              <TextInput placeholder="Your Name" style={styles.input} value={author} onChangeText={setAuthor} />
              <TextInput
                placeholder="Description"
                style={[styles.input, { height: 100 }]}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <TextInput placeholder="Calories" style={styles.input} keyboardType="numeric" value={calories} onChangeText={setCalories} />

              <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                <Text>{imageUri ? "Change Image" : "Pick Image"}</Text>
              </TouchableOpacity>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} /> : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.button, styles.cancel]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.post]} onPress={handlePost}>
                  <Text style={styles.buttonText}>Post</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ----------------------
   Styles
------------------------*/
const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginVertical: 10,
    padding: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },

  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#ddd" },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontWeight: "700", color: "#444" },

  displayName: { fontWeight: "700", fontSize: 15 },
  timeText: { color: "#777", fontSize: 12 },

  postTitle: { fontSize: 17, fontWeight: "700", marginVertical: 6 },
  postImage: { width: "100%", height: 220, borderRadius: 12, marginBottom: 10 },

  desc: { fontSize: 15, color: "#222", lineHeight: 22 },
  readMore: { color: "#1877F2", fontWeight: "600", marginTop: 6 },

  calories: { fontSize: 14, color: "#007AFF", marginTop: 10, fontWeight: "600" },

  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  actionBtn: { flex: 1, alignItems: "center" },
  actionText: { color: "#1877F2", fontWeight: "600" },

  viewComments: { color: "#555", fontWeight: "600" },

  /* Comments */
  commentsSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  noComments: { color: "#666", fontStyle: "italic" },
  commentRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-start" },

  commentAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 8 },
  commentAvatarPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#ddd", marginRight: 8, alignItems: "center", justifyContent: "center" },
  commentAvatarInitial: { fontWeight: "700", color: "#444" },

  commentAuthor: { fontWeight: "700" },
  addCommentRow: { flexDirection: "row", marginTop: 8, alignItems: "center" },
  commentInput: { flex: 1, borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 8, marginRight: 8 },
  commentPostBtn: { backgroundColor: "#007AFF", padding: 10, borderRadius: 8 },

  /* Add button + modal */
  addButton: { position: "absolute", bottom: Platform.OS === "ios" ? 34 : 24, right: 20, backgroundColor: "#007AFF", width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 4 },
  addButtonText: { fontSize: 32, color: "#fff", marginBottom: 4 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  modalContainer: { backgroundColor: "#fff", width: "92%", padding: 16, borderRadius: 12, maxHeight: "86%" },

  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 10 },

  imagePicker: { borderWidth: 1, borderColor: "#007AFF", borderRadius: 8, padding: 10, alignItems: "center", marginBottom: 10 },
  previewImage: { width: "100%", height: 140, borderRadius: 10, marginBottom: 10 },

  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  button: { flex: 1, padding: 12, borderRadius: 8, marginHorizontal: 6, alignItems: "center" },
  cancel: { backgroundColor: "#ccc" },
  post: { backgroundColor: "#007AFF" },
  buttonText: { color: "#fff", fontWeight: "700" },
});


// import React, { useEffect, useState } from 'react';
// import {
//   View,
//   Text,
//   FlatList,
//   Image,
//   StyleSheet,
//   ActivityIndicator,
//   TouchableOpacity,
//   Modal,
//   TextInput,
//   Alert,
//   ScrollView,
// } from 'react-native';
// import * as ImagePicker from 'expo-image-picker';
// import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
// import { db, storage } from '../../FireBaseConfig'; // adjust if needed
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';


// interface Recipe {
//   id: string;
//   title: string;
//   author: string;
//   description: string;
//   imageUrl: string;
//   calories: number;
//   createdAt: string;
// }


// export default function CommunityTab() {

//   const [recipes, setRecipes] = useState<Recipe[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [modalVisible, setModalVisible] = useState(false);

//   const [title, setTitle] = useState('');
//   const [author, setAuthor] = useState('');
//   const [description, setDescription] = useState('');
//   const [calories, setCalories] = useState('');
//   const [imageUri, setImageUri] = useState<string | null>(null);


//   useEffect(() => {
//     fetchRecipes();
//   }, []);

//   const fetchRecipes = async () => {
//     try {
//       const q = query(collection(db, 'recipes'), orderBy('createdAt', 'desc'));
//       const querySnapshot = await getDocs(q);
//       const recipeList: Recipe[] = [];
//       querySnapshot.forEach((doc) => {
//         recipeList.push({ id: doc.id, ...doc.data() } as Recipe);
//       });
//       setRecipes(recipeList);
//     } catch (error) {
//       console.error('Error fetching recipes:', error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const pickImage = async () => {
//     const result = await ImagePicker.launchImageLibraryAsync({
//        mediaTypes: ['images'],
//       quality: 0.7,
//     });

//     if (!result.canceled) {
//       setImageUri(result.assets[0].uri);
//     }
//   };

//   const handlePostRecipe = async () => {
//     if (!title || !author || !description || !calories) {
//       Alert.alert('Missing Info', 'Please fill out all fields.');
//       return;
//     }

//     try {
//       let imageUrl = '';
//       if (imageUri) {
//         // Upload to Firebase Storage
//         const imageRef = ref(storage, `recipes/${Date.now()}.jpg`);
//         const response = await fetch(imageUri);
//         const blob = await response.blob();
//         await uploadBytes(imageRef, blob);
//         imageUrl = await getDownloadURL(imageRef);
//       }

//       await addDoc(collection(db, 'recipes'), {
//         title,
//         author,
//         description,
//         imageUrl,
//         calories: Number(calories),
//         createdAt: serverTimestamp(),
//       });

//       Alert.alert('Success', 'Recipe posted!');
//       setModalVisible(false);
//       setTitle('');
//       setAuthor('');
//       setDescription('');
//       setCalories('');
//       setImageUri(null);
//       fetchRecipes();
//     } catch (error) {
//       console.error('Error posting recipe:', error);
//       Alert.alert('Error', 'Failed to post recipe.');
//     }
//   };

//   if (loading) {
//     return (
//       <View style={styles.centered}>
//         <ActivityIndicator size="large" color="#007AFF" />
//         <Text>Loading community recipes...</Text>
//       </View>
//     );
//   }

//   if (recipes.length === 0) {
//     return (
//       <View style={styles.centered}>
//         <Text>No recipes yet — be the first to share one!</Text>
//       </View>
//     );
//   }

//     return (
//         <View style={{ flex: 1 }}>
//       <FlatList
//         data={recipes}
//         keyExtractor={(item) => item.id}
//         renderItem={({ item }) => (
//           <View style={styles.card}>
//             {item.imageUrl ? (
//               <Image source={{ uri: item.imageUrl }} style={styles.image} />
//             ) : (
//               <View style={styles.imagePlaceholder}>
//                 <Text>No Image</Text>
//               </View>
//             )}
//             <View style={styles.info}>
//               <Text style={styles.title}>{item.title}</Text>
//               <Text style={styles.author}>By {item.author}</Text>
//               <Text style={styles.desc}>{item.description}</Text>
//               <Text style={styles.calories}>{item.calories} kcal</Text>
//             </View>
//           </View>
//         )}
//       />

//       {/* Floating Add Button */}
//       <TouchableOpacity
//         style={styles.addButton}
//         onPress={() => setModalVisible(true)}
//       >
//         <Text style={styles.addButtonText}>＋</Text>
//       </TouchableOpacity>

//       {/* Modal for new recipe */}
//       <Modal visible={modalVisible} animationType="slide" transparent>
//         <View style={styles.modalOverlay}>
//           <View style={styles.modalContainer}>
//             <ScrollView>
//               <Text style={styles.modalTitle}>Share a Recipe</Text>
//               <TextInput
//                 placeholder="Title"
//                 placeholderTextColor="#555"
//                 style={styles.input}
//                 value={title}
//                 onChangeText={setTitle}
//               />
//               <TextInput
//                 placeholder="Your Name"
//                 placeholderTextColor="#555"
//                 style={styles.input}
//                 value={author}
//                 onChangeText={setAuthor}
//               />
//               <TextInput
//                 placeholder="Description"
//                 placeholderTextColor="#555"
//                 style={[styles.input, { height: 80 }]}
//                 value={description}
//                 multiline
//                 onChangeText={setDescription}
//               />
//               <TextInput
//                 placeholder="Calories"
//                 placeholderTextColor="#555"
//                 keyboardType="numeric"
//                 style={styles.input}
//                 value={calories}
//                 onChangeText={setCalories}
//               />

//               <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
//                 <Text>{imageUri ? 'Change Image' : 'Pick an Image'}</Text>
//               </TouchableOpacity>
//               {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} />}

//               <View style={styles.buttonRow}>
//                 <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.button, styles.cancel]}>
//                   <Text style={styles.buttonText}>Cancel</Text>
//                 </TouchableOpacity>
//                 <TouchableOpacity onPress={handlePostRecipe} style={[styles.button, styles.post]}>
//                   <Text style={styles.buttonText}>Post</Text>
//                 </TouchableOpacity>
//               </View>
//             </ScrollView>
//           </View>
//         </View>
//       </Modal>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
//   card: {
//     backgroundColor: '#fff',
//     margin: 10,
//     borderRadius: 12,
//     shadowColor: '#000',
//     shadowOpacity: 0.1,
//     shadowOffset: { width: 0, height: 2 },
//     shadowRadius: 6,
//     elevation: 3,
//     overflow: 'hidden',
//   },
//   image: { width: '100%', height: 180 },
//   imagePlaceholder: {
//     width: '100%',
//     height: 180,
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: '#eee',
//   },
//   info: { padding: 12 },
//   title: { fontSize: 20, fontWeight: 'bold' },
//   author: { color: '#777', marginTop: 4, marginBottom: 6 },
//   desc: { fontSize: 15, color: '#333' },
//   calories: { marginTop: 6, color: '#007AFF', fontWeight: '600' },
//   addButton: {
//     position: 'absolute',
//     bottom: 20,
//     right: 20,
//     backgroundColor: '#007AFF',
//     width: 60,
//     height: 60,
//     borderRadius: 30,
//     alignItems: 'center',
//     justifyContent: 'center',
//     elevation: 5,
//   },
//   addButtonText: { fontSize: 32, color: '#fff', marginBottom: 2 },
//   modalOverlay: {
//     flex: 1,
//     backgroundColor: 'rgba(0,0,0,0.4)',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   modalContainer: {
//     backgroundColor: '#fff',
//     borderRadius: 16,
//     padding: 20,
//     width: '90%',
//     maxHeight: '80%',
//   },
//   modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
//   input: {
//     borderWidth: 1,
//     borderColor: '#ccc',
//     borderRadius: 10,
//     padding: 10,
//     marginBottom: 10,
//   },
//   imagePicker: {
//     borderWidth: 1,
//     borderColor: '#007AFF',
//     borderRadius: 10,
//     padding: 10,
//     alignItems: 'center',
//     marginBottom: 10,
//   },
//   previewImage: { width: '100%', height: 150, borderRadius: 10, marginBottom: 10 },
//   buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
//   button: { flex: 1, padding: 12, borderRadius: 10, marginHorizontal: 5 },
//   cancel: { backgroundColor: '#ccc' },
//   post: { backgroundColor: '#007AFF' },
//   buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
// });