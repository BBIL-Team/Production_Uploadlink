import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
// import awsconfig from './aws-exports'; // Ensure this file exists
import App from './App';
import './index.css'; // Optional, if you have global styles

// Configure Amplify with your AWS settings
Amplify.configure(awsconfig);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <Authenticator>
      <App />
    </Authenticator>
  </React.StrictMode>
);
