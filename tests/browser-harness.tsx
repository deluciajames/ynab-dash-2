import React from "react";
import ReactDOM from "react-dom/client";
import App from "../src/App";
import "../src/index.css";
import "../src/budget.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App userId="browser-test-user" showAccountButton={false} />
  </React.StrictMode>,
);
