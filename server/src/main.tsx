import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./extra.css";

if(import.meta.env.VITE_CLIENT_PLATFORM==="android")document.body.classList.add("capacitor-android");
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
