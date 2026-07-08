import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FluentProvider theme={webLightTheme}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </FluentProvider>
  </React.StrictMode>
);