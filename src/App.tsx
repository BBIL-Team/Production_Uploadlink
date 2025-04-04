import React from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth"; // Updated Auth import
import { API } from "aws-amplify/api"; // Updated API import

const App: React.FC = () => {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  async function uploadFileMetadata(file: File) {
    try {
      // Get user attributes (modern Amplify way)
      const userAttributes = await fetchUserAttributes();
      const userId = userAttributes.sub || user?.username; // 'sub' is the unique user ID

      const fileName = file.name;
      const fileSize = file.size; // Size in bytes
      const uploadTime = new Date().toISOString();

      const requestBody = {
        userId,
        fileName,
        fileSize,
        uploadTime,
      };

      // Send to Lambda via API Gateway
      await API.post("FileUploadAPI", "/upload", {
        body: requestBody,
      });

      console.log("File metadata sent successfully");
    } catch (error) {
      console.error("Error sending metadata:", error);
      throw error;
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFileMetadata(file);
    }
  };

  return (
    <main style={{ width: "100vw", minHeight: "100vh", backgroundColor: "#f8f8ff" }}>
      <header style={{ backgroundColor: "#008080", padding: "10px", display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ color: "white" }}>Welcome, {user?.username || "User"}</h1>
        <button onClick={signOut} style={{ padding: "10px 16px", fontSize: "16px" }}>
          Sign out
        </button>
      </header>

      <section style={{ padding: "20px", textAlign: "center" }}>
        <h2>Upload File Metadata</h2>
        <input type="file" onChange={handleFileUpload} />
      </section>
    </main>
  );
};

export default App;
