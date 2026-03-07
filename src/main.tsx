
  import { createRoot } from "react-dom/client";
  import L from 'leaflet';
  import App from "./app/App.tsx";
  import 'leaflet/dist/leaflet.css';
  import "./styles/index.css";

  // Disable Leaflet transition animations globally to prevent _leaflet_pos race errors
  // when navigating between React routes during zoom transitions.
  L.Map.mergeOptions({
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  });

  createRoot(document.getElementById("root")!).render(<App />);
  