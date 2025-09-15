import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';

//import EditScreenInfo from '@/components/EditScreenInfo';
import { useState } from 'react';

export default function SettingScreen() {
    const [isDarkMode, setDarkmode] = useState(false);
    const [notification, setNotification] = useState(false);


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setting</Text>
      {/*View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />*/}
      {/*<EditScreenInfo path="app/(tabs)/setting.tsx" />*/}

      {/*Account */}
      <View style = {styles.section}>
        <TouchableOpacity style={styles.item}>
            <Text style={styles.text}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item}>
            <Text style={styles.text}>Change Password</Text>
        </TouchableOpacity>
      </View>

      {/*Preferences */}
      <View style ={styles.section}>
        <Text style ={styles.text}>Dark Mode</Text>
        <Switch value={isDarkMode} onValueChange={setDarkmode}/>
      </View>
      <View style ={styles.section}>
        <Text style ={styles.section}>Notification</Text>
        <Switch value={notification} onValueChange={setNotification}/>
      </View>
    
       {/*Log out */}
        <View style = {styles.section}>
            <TouchableOpacity style = {[styles.item, {justifyContent: "center"}]}>
                <Text style={[styles.text, { color: "red" }]}>Log Out</Text>
            </TouchableOpacity>
        </View>
    </View>

       



  );
}

const styles = StyleSheet.create({
  container: 
  {
    flex: 1,
    //alignItems: 'center',
    //justifyContent: 'center',
    padding: 20,
    backgroundColor: "#fff"
  },

  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20},

  section: { marginBottom: 20},

  item: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#eee",},

  text: {fontSize: 16},
  title: 
  {
    fontSize: 20,
    fontWeight: 'bold',
  },

  /*separator: 
  {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },*/
});
