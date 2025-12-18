// app/(tabs)/community.tsx
/**
 * Calorie Hawk - Community Tab
 * - Where users can see each other posts 
 * - Share, like and comments on each other posts
 */
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
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  collection,
  onSnapshot,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  DocumentData,
  Timestamp,
} from "firebase/firestore";
import { db, storage } from "../../FireBaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "../../FireBaseConfig";
import { router } from "expo-router"; 
import { Ionicons } from "@expo/vector-icons";
import { Animated, Easing } from "react-native";
import { useTheme } from "../../utils/ThemeContext";


/* ----------------------
   Types
------------------------*/
type RecipeDoc = {
  id: string;
  title: string;
  author: string; // visible name
  authorId?: string | null; // user id
  description: string;
  imageUrl?: string;
  calories?: number;
  createdAt?: any;
  likes?: number;
  likedBy?: string[]; // array of uids or usernames
  comments?: {
    uid: string;
    text: string;
    createdAt: any;
  }[]; // simple array of comment texts (could be expanded to objects)
  editedAt?: Date | null;
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
const ShortText: React.FC<{ text: string; limit?: number; theme: any }> = ({
  text,
  limit = 180,
  theme,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > limit;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => isLong && setExpanded(!expanded)}>
      <Text style={[styles.desc, { color: theme.text }]}>
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

  // profiles lookup: key by uid and by username 
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  // post creation state
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  

  const [description, setDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  // comment state (per-post)
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // menu option for delete and edit
  const [menuPostId, setMenuPostId] = useState<string | null>(null);

  // Edition option
  const [editingPost, setEditingPost] = useState<RecipeDoc | null>(null);

  //create animation value
  const slideAnim = useRef(new Animated.Value(0)).current;

  //show and hide addbutton
  const [showAddButton, setShowAddButton] = useState(true);

  const migrateOldPosts = async () => {
      const postsSnap = await getDocs(collection(db, "recipes"));
      const usersSnap = await getDocs(collection(db, "users"));

      const userMap: Record<string, string> = {};
      usersSnap.forEach(u => {
        const data = u.data();
        if (data.displayName) {
          userMap[data.displayName] = u.id;
        }
      });

      postsSnap.forEach(async post => {
        const data = post.data();
        if (!data.authorId && data.author) {
          const uid = userMap[data.author];
          if (uid) {
            await updateDoc(post.ref, { authorId: uid });
          }
        }
    });
  };
  //To use dark mode 
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
            editedAt: data.editedAt
              ? (data.editedAt.toDate ? data.editedAt.toDate() : new Date(data.editedAt))
              : null,
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

  useEffect(() => {
    if (Object.keys(profiles).length > 0) {
      migrateOldPosts();
    }
  }, [profiles]);

  /* -----------------------------------
     Animate when modal opens/closes
  -----------------------------------*/
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: modalVisible ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [modalVisible]);

  /* -----------------------------
     Image picking + compression
  -----------------------------*/
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

  const startEdit = (item: RecipeDoc) => {
    setMenuPostId(null);

    setEditingPost(item);
    setTitle(item.title);
    setDescription(item.description || "");
    setCalories(item.calories?.toString() || "");
    setImageUri(item.imageUrl || null);

    setModalVisible(true);
  };

  /* ---------------------------
     reset Post Form if cancel
  -----------------------------*/
  const resetPostForm = () => {
    setTitle("");
    setDescription("");
    setCalories("");
    setImageUri(null);
    setEditingPost(null);
  };

  /* ---------------------------
     Create post and edit post
  -----------------------------*/
  const handleSavePost = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Title is required.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) return;

      let imageUrl = editingPost?.imageUrl ?? null;

      // upload new image ONLY if changed
      if (imageUri && imageUri !== editingPost?.imageUrl) {
        const imageRef = ref(storage, `recipes/${Date.now()}.jpg`);
        const response = await fetch(imageUri);
        const blob = await response.blob();
        await uploadBytes(imageRef, blob);
        imageUrl = await getDownloadURL(imageRef);
      }

      if (editingPost) {
        // ✏️ UPDATE POST
        await updateDoc(doc(db, "recipes", editingPost.id), {
          title: title.trim(),
          description: description.trim() || null,
          calories: calories ? Number(calories) : null,
          imageUrl,
          editedAt: serverTimestamp(),
        });
      } else {
        // ➕ CREATE POST
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const profile = profileSnap.data();

        await addDoc(collection(db, "recipes"), {
          title: title.trim(),
          description: description.trim() || null,
          calories: calories ? Number(calories) : null,
          imageUrl,

          authorId: user.uid,
          authorName: profile?.displayName || "Anonymous",
          authorPhoto: profile?.photoURL || null,

          likes: 0,
          likedBy: [],
          comments: [],
          createdAt: serverTimestamp(),
        });
      }

      // reset modal
      setTitle("");
      setDescription("");
      setCalories("");
      setImageUri(null);
      setEditingPost(null);
      setModalVisible(false);

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save post.");
    }
  };


  
  const toggleLike = async (post: RecipeDoc) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        // Show login prompt if user is not authenticated
        Alert.alert("Login Required", "Please login to like posts.");
        return;
      }

      const postRef = doc(db, "recipes", post.id);
      const viewerId = user.uid; //New user will have new View

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
     Comments: view / add.
  ------------------------*/
  const submitComment = async (postId: string) => {
    const text = (commentText[postId] || "").trim();
    if (!text) return;

    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Login Required", "Please login to comment.");
        return;
      }

      setCommentingPostId(postId);
      const postRef = doc(db, "recipes", postId);

      await updateDoc(postRef, {
        comments: arrayUnion({
          uid: user.uid,
          text,
          createdAt: Timestamp.now(), // ✅ FIX
        }),
      });

      // Clear the comment text for this specific post
      setCommentText((prev) => ({ ...prev, [postId]: "" }));
      Keyboard.dismiss(); // Dismiss keyboard after posting
      
    } catch (e) {
      console.error("comment error", e);
      Alert.alert("Error", "Failed to post comment");
    } finally {
      setCommentingPostId(null);
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

  /* ----------------------
     DeletePost
  ------------------------*/
  const deletePost = async (postId: string) => {
    Alert.alert("Delete post?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "recipes", postId));
        },
      },
    ]);
  };

  

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={posts}
        keyExtractor={(it) => it.id}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => setShowAddButton(false)}
        onScrollEndDrag={() => setShowAddButton(true)}
        renderItem={({ item }) => {
          const profile = findProfileForPost(item);
          const postTime = item.createdAt ? timeAgo(item.createdAt as Date) : "";
          const isOwner = auth.currentUser?.uid === item.authorId;
          const commentCount = Array.isArray(item.comments) ? item.comments.length : 0;
          const likedByViewer = Array.isArray(item.likedBy) &&  auth.currentUser && item.likedBy.includes(auth.currentUser.uid);
          
          return (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              {/* header: profile pic + name + time */}
              
              <View style={styles.headerRow}>
                <View style={{ flexDirection: "row", flex: 1, alignItems: "center" }}>
                  <TouchableOpacity onPress={() => router.push(`/profile/${profile.uid}`)}>
                  {profile.photoURL ? (
                    <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {(profile.displayName || "U").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  </TouchableOpacity>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.displayName, { color: theme.text }]}>
                      {profile.displayName}
                    </Text>
                    <Text style={[styles.timeText, { color: theme.text }]}>
                      {postTime}
                      {item.editedAt && " · Edited"}
                    </Text>
                  </View>
                </View>

                {isOwner && (
                <TouchableOpacity onPress={() => setMenuPostId(item.id)}>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#666" />
                </TouchableOpacity>
                )}
              </View>

              {menuPostId === item.id && (
                <TouchableWithoutFeedback onPress={() => setMenuPostId(null)}>
                  <View style={styles.menuBackdrop}>
                    <View style={styles.menu}>
                      <TouchableOpacity
                        onPress={() => {
                          setMenuPostId(null);
                          startEdit(item);
                        }}
                      >
                        <Text style={styles.menuItem}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setMenuPostId(null);
                          deletePost(item.id);
                        }}
                      >
                        <Text style={[styles.menuItem, { color: "red" }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              )}

              <Text style={[styles.postTitle, { color: theme.text }]}>{item.title}</Text>

              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.postImage} />
              ) : null}

              <ShortText text={item.description} theme={theme} />

              {typeof item.calories === "number" && item.calories > 0 && (
                <Text style={[styles.calories, { color: theme.tint }]}>{item.calories} kcal</Text>
              )}

              {/* action bar */}
              <View style={styles.actions}>
                <TouchableOpacity 
                style={[styles.actionBtn, { backgroundColor: theme.card }]} 
                onPress={() => toggleLike(item)}
                >
                  <Text style={[styles.actionText,  likedByViewer && { color: "#e0245e" }]}>
                    {likedByViewer ? "❤️" : "🤍"} {item.likes ?? 0}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.card }]}
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
                      <Text style={[styles.noComments, { color: theme.text }]}>No comments yet — be the first!</Text>
                    ) : (
                      (item.comments || []).map((c, idx) => {
                        const commenterProfile = profiles[c.uid];

                        return (
                          <View key={idx} style={styles.commentRow}>
                            {commenterProfile?.photoURL ? (
                              <Image
                                source={{ uri: commenterProfile.photoURL }}
                                style={styles.commentAvatar}
                              />
                            ) : (
                              
                              <View style={[styles.commentAvatarPlaceholder, 
                                { backgroundColor: theme.border || "#ddd" }]}>
                                <Text style={[styles.commentAvatarInitial, 
                                  { color: theme.text || "#444" }]}>
                                  {(commenterProfile?.displayName || "U")
                                    .charAt(0)
                                    .toUpperCase()}
                                </Text>
                              </View>
                            )}

                            <View style={{ flex: 1 }}>
                              <Text style={[styles.commentAuthor, { color: theme.text }]}>
                                {commenterProfile?.displayName || "Unknown"}
                              </Text>
                              <Text style={{ color: theme.text }}>{c.text}</Text>
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
                      placeholderTextColor={theme.text + "80"} // 50% opacity
                      value={commentText[item.id] ?? ""}
                      onChangeText={(t) => {
                        setCommentText((s) => ({ ...s, [item.id]: t }));
                        setTimeout(() => {
                          scrollRef.current?.scrollToEnd({ animated: true });
                        }, 50);
                      }}
                      style={[
                        styles.commentInput,
                        { 
                          borderColor: theme.border, 
                          backgroundColor: theme.background,
                          color: theme.text 
                        }
                      ]}
                      multiline
                      onSubmitEditing={() => submitComment(item.id)} // Allow Enter to submit
                      returnKeyType="send"
                    />

                    <TouchableOpacity
                      style={[styles.commentPostBtn, 
                        { backgroundColor: theme.tint || "#007AFF" }]}
                      onPress={() => submitComment(item.id)}
                      disabled={commentingPostId === item.id}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>
                        {commentingPostId === item.id ? "Posting..." : "Post"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <TouchableOpacity
                  onPress={() => setExpandedComments((s) => ({ ...s, [item.id]: true }))}
                  style={{ paddingTop: 8 }}
                >
                  <Text style={[styles.viewComments, { color: theme.tint }]}>View comments ({commentCount})</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Floating Add Button */}
      {showAddButton && (
        <TouchableOpacity
          style={[
            styles.addButton,
            {
              backgroundColor: mode === "light" ? "#FFD646" : "#9D00FF",
            },
          ]}
          onPress={() => setModalVisible(true)}
        >
          <Text
            style={[
              styles.addButtonText,
              { color: mode === "light" ? "#5B21B6" : theme.card },
            ]}
          >
            ＋
          </Text>
        </TouchableOpacity>
      )}

      {/* New post modal */}
      <Modal visible={modalVisible} animationType="none" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
            style={{ width: "100%" }}
          >
            <Animated.View
              style={[
                styles.modalContainer, 
                { backgroundColor: theme.card },
                { transform: [
                    {
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [60, 0],
                      }),
                    },
                  ],
                  opacity: slideAnim,
                },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>Create a Post</Text>

                <TextInput
                  placeholder="Title (required)"
                  placeholderTextColor="#888"
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                  value={title}
                  onChangeText={setTitle}
                />

                <TextInput
                  placeholder="Description (optional)"
                  placeholderTextColor="#888"
                  style={[styles.input, { borderColor: theme.border, color: theme.text }, { height: 100 }]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />

                <TextInput
                  placeholder="Calories (optional)"
                  placeholderTextColor="#888"
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                  keyboardType="numeric"
                  value={calories}
                  onChangeText={setCalories}
                />

                <TouchableOpacity
                  style={[
                    styles.imagePicker,
                    { borderColor: theme.tint }
                  ]}
                  onPress={pickImage}
                >
                  <Text style={{ color: theme.text }}>
                    {imageUri ? "Change Image" : "Pick Image"}
                  </Text>
                </TouchableOpacity>

                {imageUri && (
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                )}

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancel]}
                    onPress={() => {
                      resetPostForm();
                      setModalVisible(false);
                    }}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.post]}
                    onPress={handleSavePost}
                  >
                    <Text style={styles.buttonText}>
                      {editingPost ? "Save Changes" : "Post"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
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
  addButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 90 : 70,
    right: 16,
    backgroundColor: "#9D00FF",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  addButtonText: { fontSize: 32, color: "#fff", marginBottom: 4 },

  modalOverlay: { 
    flex: 1, 
    backgroundColor: "rgba(0,0,0,0.4)", 
    justifyContent: "center", 
    //alignItems: "center" 
    },
  
  modalContainer: { 
    backgroundColor: "#fff", 
    width: "92%", 
    alignSelf: "center",
    padding: 16, 
    borderRadius: 12, 
    maxHeight: "86%" },

  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 10 },

  imagePicker: { borderWidth: 1, borderColor: "#007AFF", borderRadius: 8, padding: 10, alignItems: "center", marginBottom: 10 },
  previewImage: { width: "100%", height: 140, borderRadius: 10, marginBottom: 10 },

  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  button: { flex: 1, padding: 12, borderRadius: 8, marginHorizontal: 6, alignItems: "center" },
  cancel: { backgroundColor: "#ccc" },
  post: { backgroundColor: "#007AFF" },
  buttonText: { color: "#fff", fontWeight: "700" },

  /* Add Menu + menuItem */
  menuBackdrop: {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 10,
},

menu: {
  position: "absolute",
  top: 30,
  right: 10,
  backgroundColor: "#fff",
  borderRadius: 8,
  paddingVertical: 6,
  paddingHorizontal: 10,
  shadowColor: "#000",
  shadowOpacity: 0.15,
  shadowRadius: 6,
  elevation: 5,
},

menuItem: {
  paddingVertical: 8,
  fontSize: 16,
  fontWeight: "500",
},
});