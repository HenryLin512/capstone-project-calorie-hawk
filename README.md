# 📘 Instruction for How to Use Our Calorie Hawk app:
Option 1 — 📱 Run with Expo Go (Easiest & Recommended)

👉 Step 1 — Install Expo Go
  * Go to the App Store (iPhone) or Play Store (Android)
  * Search for Expo Go
  * Download & install

👉 Step 2 — Open Your Camera
  * Go to your camera on your phone (Make sure your camera can read QR code)

👉 Step 3 — Scan the QR Code
  * Here is the QR code link:
https://expo.dev/preview/update?message=Complete+Build+v3&updateRuntimeVersion=1.0.0&createdAt=2025-12-18T18%3A20%3A26.332Z&slug=exp&projectId=b4a59533-2248-4d83-8604-77ef484d1287&group=7722efea-8b5b-4fdc-bf57-8c2f74b1c265
  
  * Copy and paste this link into your browser to access the QR code
  
  * Then point your camera at the QR code until you see "Open in Expo Go" (for iPhone)
  
  * Tap on "Open in Expo Go", then wait for the app to load, and you are good to go and try our app!
Note: To log in, just click on Sign Up, and create an email with @gmail.com and your password of choice.

Option 2 — 💻 Run Locally from Code (For Full Testing)

👉 Step 1 — Clone the Repository
git clone <our repository URL> in your VS Code and download Expo Go on your phone.

👉 Step 2 — Install Dependencies

* After cloning our repository in VS Code, from your terminal, type cd to change the directory into the CalorieHawk folder.

* Then you will see a lot of red errors popping off because of  missing dependencies. Then type in the terminal the command below: 

                      npm install

👉 Step 3 — Install Firebase
                      
                      npm install firebase

⚠️ Caution: If after installing all dependencies and VS Code still displays red errors. Closing your VS Code and reopening it again will clear out all the red errors.

👉 Step 4 — Start the App
                      
                      npx expo start
                      
                     
 * The expo will start building the app locally on your machine, and it will display the QR code in your terminal.

 * Point your camera at the QR code to scan and wait for the app to finish setting up to use (Make sure you download Expo Go on Your Phone)

✔️ The app will run instantly — no setup needed.

-----
🔗 Backend Hosting (Render) 

Our macro–nutrition backend is hosted on Render and publicly accessible for testing:

Render Backend URL:

https://capstone-project-calorie-hawk.onrender.com

(Used for AI macro + nutrition calculations.)

⚠️ Hosting Disclaimer:
This Render service has been prepaid and will remain active for at least 1 month after submission, ensuring full functionality for evaluation.
_____________________________________________________________________________________________________

# 🦅 Calorie Hawk

Calorie Hawk is a lightweight, mobile-first calorie tracking application designed to make nutrition tracking **simple, accessible, and motivating**.  
Our goal is to help users—like our teammate Vinh Tu, who inspired this project—achieve their health goals by making calorie tracking effortless and inclusive.

---

## 🚀 Vision
Most calorie-tracking apps are cluttered and overwhelming. Calorie Hawk focuses on:
- **Simplicity:** Log meals in seconds with barcode scanning, voice entry, or quick-add buttons.  
- **Personalization:** Smart calorie goals that adapt based on user progress.  
- **Inclusivity:** A diverse food database that includes home-cooked meals and global cuisines.  
- **Motivation:** Streaks, reminders, and progress badges to encourage long-term use.  
- **AI Assistance:** Use image recognition to estimate calories from a **photo of your meal**.  

---

## 🧑‍🤝‍🧑 Target Audience
- Busy students & professionals  
- Beginners new to calorie tracking  
- Fitness enthusiasts  
- People with specific dietary goals (weight loss, muscle gain, health management)  

---

## ❗ Problem We’re Solving
- Existing apps often require **too much effort** (manual entry, long searches).  
- Many databases lack **accuracy** or **cultural inclusivity**.  
- Users often feel **frustrated and quit after 1–2 weeks**.  

Calorie Hawk solves these problems by making tracking **accessible, accurate, and engaging**.

---

## ✨ Features
- ✅ Quick meal logging (barcode, manual entry, voice)  
- ✅ **AI-powered calorie estimation** from food photos  
- ✅ Personalized calorie & nutrition goals  
- ✅ Culturally inclusive food database  
- ✅ Daily/weekly progress dashboard  
- ✅ Streaks, reminders, and gamification  

---

## 🛠️ Tech Stack
- **Frontend:** React Native (cross-platform iOS/Android)  
- **Backend:** Firebase (authentication, cloud storage)  
- **Database:** Cloud Firestore: NoSQL document database  
- **Python (API) -> AI**
  - Use Google Vision for AI food recognitions
  - Use USDA FoodData Central API to fetch calories
  - Use preset personalities to coach user and give feedback

---

