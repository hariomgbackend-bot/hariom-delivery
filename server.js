import express from "express";
import cors from "cors";
import db from "./firestore.js";
import { storage } from "./storage.js";
import fetch from "node-fetch";
import multer from "multer";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import {
  collection,
  addDoc,
  getDocs,
  Timestamp,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "firebase/firestore";
// ===== AUTH CONFIG =====

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const OTP_EXPIRY_MINUTES = 10;
const JWT_EXPIRY = "8h";

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

/* -------- TOKENS -------- */

const WHATSAPP_TOKEN = "YOUR_WHATSAPP_TOKEN";
const PHONE_NUMBER_ID = "959241260610800";

const FAST2SMS_API_KEY = "KEY";

// ===== EMAIL SETUP =====

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: ADMIN_EMAIL,
    pass: process.env.EMAIL_PASS
  }
});
transporter.verify(function(error, success) {
  if (error) {
    console.log("Email setup error:", error);
  } else {
    console.log("Email server ready");
  }
});


/* -------- WHATSAPP FUNCTION -------- */

async function sendWhatsapp(phone, message){
  try{
    await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        messaging_product:"whatsapp",
        to: phone,
        type:"text",
        text:{ body: message }
      })
    });
  }catch(err){
    console.log("Whatsapp error:", err.message);
  }
}

/* -------- SMS FUNCTION -------- */

async function sendSMS(phone, message){
  try{
    const r = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: FAST2SMS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        route: "q",
        message: message,
        language: "english",
        numbers: phone
      })
    });

    const data = await r.json();
    console.log("SMS RESPONSE:", data);

  }catch(err){
    console.log("SMS error:", err.message);
  }
}

/* -------- PRODUCTS -------- */

app.get("/products", async (req, res) => {
  const snapshot = await getDocs(collection(db, "products"));
  const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(list);
});

app.post("/products", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const q = query(collection(db, "products"), where("name", "==", name));
  const snapshot = await getDocs(q);

  if (!snapshot.empty)
    return res.json({ exists: true });

  await addDoc(collection(db, "products"), {
    name: name
  });

  res.json({ success: true });
});

/* -------- MAKES -------- */

app.get("/makes", async (req, res) => {
  const snapshot = await getDocs(collection(db, "makes"));
  const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(list);
});

app.post("/makes", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const q = query(collection(db, "makes"), where("name", "==", name));
  const snapshot = await getDocs(q);

  if (!snapshot.empty)
    return res.json({ exists: true });

  await addDoc(collection(db, "makes"), {
    name: name
  });

  res.json({ success: true });
});


/* -------- MODELS -------- */

app.get("/models", async (req, res) => {
  const snapshot = await getDocs(collection(db, "models"));
  const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(list);
});

app.post("/models", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const q = query(collection(db, "models"), where("name", "==", name));
  const snapshot = await getDocs(q);

  if (!snapshot.empty)
    return res.json({ exists: true });

  await addDoc(collection(db, "models"), {
    name: name
  });

  res.json({ success: true });
});



/* -------- CREATE DELIVERY -------- */

app.post("/createDelivery", authenticate, authorize(["admin", "accountant"]), async (req, res) => {
  try {
    const data = req.body;

    const docRef = await addDoc(collection(db, "deliveries"), {
      ...data,
      priority: data.priority || "normal",
      estimated_delivery_time: data.estimated_delivery_time || null,
      created_timestamp: Timestamp.now(),
      status: "pending"
    });

    await sendWhatsapp(
      data.phone,
      `Hello ${data.customer_name}, your delivery is scheduled at ${data.estimated_delivery_time}`
    );

    await sendSMS(
      data.phone,
      `Hariom Delivery: Your delivery scheduled at ${data.estimated_delivery_time}`
    );

    res.json({ success: true, id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* -------- GET DELIVERIES -------- */

app.get("/deliveries", authenticate, authorize(["admin", "accountant"]), async (req, res) => {
  try {
    //const driver = req.query.driver;
    let q = collection(db, "deliveries");

    /*if (driver) {
      q = query(q, where("assigned_driver_name", "==", driver));
    }*/

    const snapshot = await getDocs(collection(db, "deliveries"));

    let deliveries = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    deliveries.sort((a,b)=> (b.priority === "urgent") - (a.priority === "urgent"));

    res.json(deliveries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* -------- GET SINGLE DELIVERY -------- */

app.get("/delivery/:id", async (req, res) => {
  try {

    const refDoc = doc(db, "deliveries", req.params.id);
    const snap = await getDoc(refDoc);

    if(!snap.exists()){
      return res.status(404).json({ error: "Delivery not found" });
    }

    res.json({
      id: snap.id,
      ...snap.data()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* -------- MARK LOADED -------- */

app.post("/markLoaded/:id", upload.single("photo"), async (req,res)=>{
  try {

    const storageRef = ref(storage, "delivery_proofs_loaded/" + Date.now());
    await uploadBytes(storageRef, req.file.buffer);
    const url = await getDownloadURL(storageRef);

    const refDoc = doc(db, "deliveries", req.params.id);

    await updateDoc(refDoc, {
      status: "loaded",
      loaded_timestamp: Timestamp.now(),
      loaded_location: {
        lat: req.body.lat,
        lng: req.body.lng
      },
      photo_loaded_url: url
    });

    const snap = await getDoc(refDoc);
    const d = snap.data();

    await sendWhatsapp(
      d.phone,
      `Hello ${d.customer_name}, your order is OUT FOR DELIVERY.`
    );

    await sendSMS(
      d.phone,
      `Hariom Delivery: Your order is OUT FOR DELIVERY.`
    );

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* -------- MARK DELIVERED -------- */

app.post("/markDelivered/:id", upload.single("photo"), async (req,res)=>{
  try {

    const storageRef = ref(storage, "delivery_proofs_delivered/" + Date.now());
    await uploadBytes(storageRef, req.file.buffer);
    const url = await getDownloadURL(storageRef);

    const refDoc = doc(db, "deliveries", req.params.id);

    await updateDoc(refDoc, {
      status: "delivered",
      delivered_timestamp: Timestamp.now(),
      delivered_location: {
        lat: req.body.lat,
        lng: req.body.lng
      },
      photo_delivered_url: url
    });

    const snap = await getDoc(refDoc);
    const d = snap.data();

    await sendWhatsapp(
      d.phone,
      `Hello ${d.customer_name}, your order has been DELIVERED successfully.`
    );

    await sendSMS(
      d.phone,
      "Hariom Delivery: Your order has been delivered successfully."
    );

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//update
app.put("/delivery/:id", authenticate, authorize(["admin"]), async (req,res)=>{
  const refDoc = doc(db,"deliveries",req.params.id);
  await updateDoc(refDoc, req.body);
  res.json({success:true});
});
//delete
app.delete("/delivery/:id",  authenticate, authorize(["admin"]), async (req,res)=>{
  await deleteDoc(doc(db,"deliveries",req.params.id));
  res.json({success:true});
});


/* -------- DRIVERS -------- */

// ADD DRIVER
app.post("/addDriver", authenticate, authorize(["admin"]), async (req, res) => {

  const {
    driver_name,
    phone,
    vehicle_number,
    vehicle_make,
    vehicle_model,
    pin
  } = req.body;

  if(!driver_name){
    return res.status(400).json({ error: "Driver name required" });
  }

  if (!pin || !/^\d{6}$/.test(pin)) {
  return res.status(400).json({ error: "PIN must be exactly 6 digits" });
  }

  // Hash PIN
  const pinHash = await bcrypt.hash(pin, 10);

  const docRef = await addDoc(collection(db, "drivers"), {
    driver_name,
    phone: phone || "",
    vehicle_number: vehicle_number || "",
    vehicle_make: vehicle_make || "",
    vehicle_model: vehicle_model || "",
    pinHash,
    created_timestamp: Timestamp.now()
  });

  res.json({ success: true, id: docRef.id });
});

// GET DRIVERS
app.get("/drivers", authenticate, authorize(["admin"]), async (req, res) => {

  const snapshot = await getDocs(collection(db, "drivers"));

  const drivers = snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  res.json(drivers);
});

// UPDATE DRIVER
app.put("/driver/:id", authenticate, authorize(["admin"]), async (req, res) => {

  const { pin, ...otherFields } = req.body;

  const refDoc = doc(db, "drivers", req.params.id);

  // If PIN is provided → validate and hash
  if (pin) {

    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    await updateDoc(refDoc, {
      ...otherFields,
      pinHash
    });

  } else {

    await updateDoc(refDoc, otherFields);

  }

  res.json({ success: true });
});

// DELETE DRIVER WITH PROTECTION

app.delete("/driver/:id", authenticate, authorize(["admin"]), async (req, res) => {

  try{

    const driverId = req.params.id;

    const q = query(
      collection(db,"deliveries"),
      where("assigned_driver_id","==",driverId)
    );

    const snapshot = await getDocs(q);

    let hasActive = false;

    snapshot.forEach(docSnap=>{
      const d = docSnap.data();
      if(d.status !== "delivered"){
        hasActive = true;
      }
    });

    if(hasActive){
      return res.json({error:"Driver has active deliveries. Cannot delete."});
    }

    await deleteDoc(doc(db,"drivers",driverId));

    res.json({success:true});

  }catch(error){
    res.status(500).json({error:error.message});
  }
});

// PUBLIC DRIVER LIST (for driver login page only)
app.get("/driver-list-public", async (req, res) => {

  const snapshot = await getDocs(collection(db, "drivers"));

  const drivers = snapshot.docs.map(d => ({
    id: d.id,
    driver_name: d.data().driver_name
  }));

  res.json(drivers);
});

// ===== VERIFY DRIVER PIN =====

app.post("/driver/verify-pin", async (req, res) => {

  try {

    const { driver_id, pin } = req.body;

    if (!driver_id || !pin) {
      return res.status(400).json({ error: "Driver ID and PIN required" });
    }

    const refDoc = doc(db, "drivers", driver_id);
    const snap = await getDoc(refDoc);

    if (!snap.exists()) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const driver = snap.data();

    const match = await bcrypt.compare(pin, driver.pinHash);

    if (!match) {
      return res.status(401).json({ error: "Invalid PIN" });
    }

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});

// ===== GET DRIVER DELIVERIES =====

/*app.get("/driverDeliveries/:driverId", async (req, res) => {

  try {

    const driverId = req.params.driverId;

    const q = query(
      collection(db, "deliveries"),
      where("assigned_driver_id", "==", driverId)
    );

    const snapshot = await getDocs(q);

    const deliveries = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.json(deliveries);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});*/

app.post("/driverDeliveries", async (req, res) => {

  const { driver_id, pin } = req.body;

if (!driver_id || !pin) {
  return res.status(400).json({ error: "Driver ID and PIN required" });
}

const refDoc = doc(db, "drivers", driver_id);
const snap = await getDoc(refDoc);

if (!snap.exists()) {
  return res.status(404).json({ error: "Driver not found" });
}

const driver = snap.data();

const match = await bcrypt.compare(pin, driver.pinHash);

if (!match) {
  return res.status(401).json({ error: "Invalid PIN" });
}

const q = query(
  collection(db, "deliveries"),
  where("assigned_driver_id", "==", driver_id)
);

const snapshot = await getDocs(q);

const deliveries = snapshot.docs.map(d => ({
  id: d.id,
  ...d.data()
}));

res.json(deliveries);
});

// ===== ADMIN OTP REQUEST =====

app.post("/admin/request-otp", async (req, res) => {

  const { email } = req.body;

  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Unauthorized email" });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Save OTP in Firestore
  await addDoc(collection(db, "admin_otps"), {
    email,
    otp,
    expires_at: expiresAt
  });

  // Send Email
  await transporter.sendMail({
    from: ADMIN_EMAIL,
    to: email,
    subject: "Admin Login OTP",
    text: `Your OTP is: ${otp}. It will expire in ${OTP_EXPIRY_MINUTES} minutes.`
  });

  res.json({ success: true });
});

// ===== VERIFY ADMIN OTP =====
app.post("/admin/verify-otp", async (req, res) => {
  try {

    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP required" });
    }

    const q = query(
      collection(db, "admin_otps"),
      where("email", "==", email),
      where("otp", "==", otp)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    const now = Date.now();
    const expiryTime = data.expires_at.toDate().getTime();

    if (now > expiryTime) {
      return res.status(400).json({ error: "OTP expired" });
    }

    // delete OTP after use
    await deleteDoc(doc(db, "admin_otps", docSnap.id));

    // create JWT
    const token = jwt.sign(
      { role: "admin" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ success: true, token });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== AUTH MIDDLEWARE =====

function authenticate(req, res, next) {

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}


  function authorize(allowedRoles) {
  return (req, res, next) => {

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
  
}





const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
