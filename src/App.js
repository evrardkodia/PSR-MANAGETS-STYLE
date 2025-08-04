import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Components
import Navbar from './components/Navbar';

// Pages
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import UploadBeat from './pages/UploadBeat';
import ManageBeats from './pages/ManageBeats';
import EditBeat from './pages/EditBeat';
import STYPlayer from './pages/STYPlayer';
import STYPlayerSM from './pages/STYPlayerSM';
import LecteurSTY from './pages/lecteur'; // ✅ Ajouté ici

function App() {
  return (
    <Router>
      <Navbar />
      <div className="min-h-screen bg-gray-100 text-gray-800 font-sans pt-2">
        <Routes>
          {/* Page d'accueil par défaut */}
          <Route path="/" element={<Dashboard />} />

          {/* Authentification */}
          <Route path="/auth" element={<Auth />} />

          {/* Dashboard et gestion */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload-beat" element={<UploadBeat />} />
          <Route path="/manage-beats" element={<ManageBeats />} />
          <Route path="/edit-beat/:id" element={<EditBeat />} />

          {/* Lecteurs STY */}
          <Route path="/sty-player" element={<STYPlayer />} />
          <Route path="/sty-player-sm" element={<STYPlayerSM />} />
          <Route path="/lecteur" element={<LecteurSTY />} /> {/* ✅ Route ajoutée */}

          {/* Page 404 - Not Found */}
          <Route
            path="*"
            element={
              <div className="flex flex-col items-center justify-center h-screen">
                <h1 className="text-4xl font-bold text-red-500 mb-4">404</h1>
                <p className="text-xl">Page introuvable</p>
              </div>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
