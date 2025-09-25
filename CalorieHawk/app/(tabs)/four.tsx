import { StyleSheet, Image, FlatList, Alert, TouchableOpacity, SafeAreaView, Text, View } from 'react-native';
import React, { useState, useEffect } from 'react';
import { storage, auth } from '../../FirebaseConfig';
import { getDownloadURL, ref, uploadBytes, listAll, deleteObject } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { User, onAuthStateChanged } from 'firebase/auth';



export default function TabTwoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Storage</Text>
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
