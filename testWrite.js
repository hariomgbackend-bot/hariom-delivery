import db from "./firestore.js";
import { collection, addDoc, Timestamp } from "firebase/firestore";

async function createDelivery() {
  try {
    const docRef = await addDoc(collection(db, "deliveries"), {
      delivery_id: "AUTO",
      customer_name: "Rahul Sharma",
      phone: "9876543210",
      address: "Jaipur, Rajasthan",

      product_name: "Wooden Table",
      product_serial_number: "WT-1023",

      assigned_driver_id: "driver_1",
      driver_instructions: "Bring cash",

      status: "pending",

      photo_loaded_url: "",
      photo_delivered_url: "",

      created_timestamp: Timestamp.now(),
      loaded_timestamp: null,
      delivered_timestamp: null,

      loaded_location: null,
      delivered_location: null,

      collection_amount: 5000,
      remarks: ""
    });

    console.log("Delivery created with ID:", docRef.id);
  } catch (e) {
    console.error("Error adding document:", e);
  }
}

createDelivery();
