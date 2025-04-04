import React from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";

const App: React.FC = () => {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  return (
    <main style={{ width: "100vw", minHeight: "100vh", backgroundColor: "#f8f8ff" }}>
      <header style={{ backgroundColor: "#008080", padding: "10px", display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ color: "white" }}>Welcome, {user?.username || "User"}</h1>
        <button onClick={signOut} style={{ padding: "10px 16px", fontSize: "16px" }}>Sign out</button>
      </header>

      <section style={{ padding: "20px", textAlign: "center" }}>
        <h2>User Profile</h2>
        <p><strong>Username:</strong> {user?.username}</p>
        <p><strong>Email:</strong> {user?.attributes?.email || "Not provided"}</p>
        <p><strong>Phone:</strong> {user?.attributes?.phone_number || "Not provided"}</p>
      </section>
    </main>
  );
};

export default App;
