import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {LanguageSwitch,startLocalization} from "./web-i18n";
import "./style.css";
import "./extra.css";

if(import.meta.env.VITE_CLIENT_PLATFORM==="android")document.body.classList.add("capacitor-android");
startLocalization();
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/><LanguageSwitch/></React.StrictMode>);
