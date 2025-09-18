import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

axios.defaults.baseURL = 'https://psr-manager-beat.onrender.com';

// 🔹 Connexion à Supabase
const supabase = createClient(
  'https://swtbkiudmfvnywcgpzfe.supabase.co',
  process.env.REACT_APP_SUPABASE_KEY // ⚠️ Mets ta clé API publique dans .env
);

export default function UploadBeat() {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [tempo, setTempo] = useState('');
  const [description, setDescription] = useState('');
  const [timeSignature, setTimeSignature] = useState('');
  const [customSignature, setCustomSignature] = useState(false);
  const [customTop, setCustomTop] = useState('');
  const [customBottom, setCustomBottom] = useState('');
  const [loading, setLoading] = useState(false);

  // 🔵 Progress UI
  const [progress, setProgress] = useState(0);            // 0..100
  const [progressLabel, setProgressLabel] = useState(''); // texte d’étape

  const navigate = useNavigate();

  const handleFileUpload = (e) => {
    setFile(e.target.files[0]);
    setStep(2);
  };

  // Helpers progression
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

  // Map simple de pourcentages par étape
  // Upload .sty : 0 → 55% (réel via onUploadProgress)
  // Préparation serveur : 55% → 70% (palier quand terminé)
  // Uploads Supabase : 70% → 100% (par fichier terminé)
  const UI_STEPS = {
    UPLOAD_START: 0,
    UPLOAD_END: 55,
    PREP_END: 70,
    SUPABASE_END: 100,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file || !title) {
      alert("Fichier et titre requis !");
      return;
    }

    const formData = new FormData();
    formData.append('beat', file);
    formData.append('title', title);
    formData.append('tempo', tempo);
    formData.append('description', description);

    const signature = customSignature ? `${customTop}/${customBottom}` : timeSignature;
    formData.append('signature', signature);

    setLoading(true);
    setProgress(0);
    setProgressLabel('Préparation de l’envoi du fichier…');

    try {
      const token = localStorage.getItem('token');

      // 1️⃣ Upload du beat (progress réel)
      setProgressLabel('Upload du fichier .sty…');
      const uploadRes = await axios.post('/api/beats/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const ratio = evt.loaded / evt.total;
          const p = UI_STEPS.UPLOAD_START + ratio * (UI_STEPS.UPLOAD_END - UI_STEPS.UPLOAD_START);
          setProgress(clamp(p));
        },
      });

      const beatId = uploadRes.data.id;
      setProgress(UI_STEPS.UPLOAD_END);
      setProgressLabel('Génération des MID/WAV sur le serveur…');

      // 2️⃣ Génération des mid + wav (pas d’API de progress → palier à la fin)
      const prepareRes = await axios.post('/api/player/prepare-all-sections', { beatId }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const generatedFiles = prepareRes.data.sections || []; // tableau d'objets
      setProgress(UI_STEPS.PREP_END);
      setProgressLabel(`Préparation terminée (${generatedFiles.length} éléments). Envoi vers Supabase…`);

      // 3️⃣ Upload sur Supabase (progress par fichier terminé)
      const total = generatedFiles.length || 1;
      let done = 0;

      for (const fileObj of generatedFiles) {
        const fileUrl = fileObj.url;         // URL source (fichier généré côté serveur)
        const fileName = fileObj.midFilename; // nom du fichier côté bucket

        try {
          // Récupère le blob depuis l’URL
          const fileBlob = await fetch(fileUrl).then(res => res.blob());

          // Upload dans le bucket
          const { error } = await supabase
            .storage
            .from('midiAndWav')
            .upload(`${beatId}/${fileName}`, fileBlob, {
              cacheControl: '3600',
              upsert: true
            });

          if (error) {
            console.error(`Erreur upload Supabase pour ${fileName}:`, error);
          } else {
            console.log(`✅ Fichier uploadé sur Supabase: ${fileName}`);
          }
        } catch (fetchErr) {
          console.error(`Erreur fetch pour ${fileName}:`, fetchErr);
        } finally {
          // Incrément de progression par fichier terminé
          done += 1;
          const ratio = done / total;
          const p = UI_STEPS.PREP_END + ratio * (UI_STEPS.SUPABASE_END - UI_STEPS.PREP_END);
          setProgress(clamp(p));
          setProgressLabel(`Envoi Supabase… ${done}/${total}`);
        }
      }

      setProgress(100);
      setProgressLabel('Terminé ✅');

      setLoading(false);
      alert('Beat ajouté et fichiers envoyés sur Supabase ✅');
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setLoading(false);
      setProgress(0);
      setProgressLabel('');
      alert(err.response?.data?.error || 'Erreur lors de l’envoi ou de la préparation');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50">
          <div className="w-full max-w-md mx-auto bg-gray-800 p-6 rounded-xl shadow-xl border border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <div className="animate-spin rounded-full h-6 w-6 border-t-4 border-blue-500"></div>
              <p className="text-lg font-semibold">Traitement en cours…</p>
            </div>

            {/* Barre de progression */}
            <div className="w-full bg-gray-700 rounded overflow-hidden h-3">
              <div
                className="bg-blue-500 h-3 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-gray-300">{progressLabel || '…'}</span>
              <span className="text-sm font-mono">{clamp(progress)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-4">Ajouter un nouveau beat</h2>

        {step === 1 && (
          <div>
            <label className="block mb-2">Charger un fichier .sty :</label>
            <input
              type="file"
              accept=".sty"
              onChange={handleFileUpload}
              className="w-full p-2 bg-gray-700 rounded"
              required
            />
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label>Nom du beat :</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                required
              />
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={customSignature}
                  onChange={(e) => setCustomSignature(e.target.checked)}
                />
                <span>Signature rythmique personnalisée</span>
              </label>

              {!customSignature ? (
                <select
                  value={timeSignature}
                  onChange={(e) => setTimeSignature(e.target.value)}
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 mt-2"
                  required
                >
                  <option value="">Sélectionner</option>
                  <option value="4/4">4/4</option>
                  <option value="6/8">6/8</option>
                  <option value="12/8">12/8</option>
                  <option value="3/4">3/4</option>
                  <option value="6:8/4:4">6:8/4:4</option>
                  <option value="2/4">2/4</option>
                </select>
              ) : (
                <div className="flex items-center space-x-2 mt-2">
                  <input
                    type="number"
                    placeholder="Top"
                    value={customTop}
                    onChange={(e) => setCustomTop(e.target.value)}
                    className="w-1/2 p-2 rounded bg-gray-700 border border-gray-600"
                    required
                  />
                  <span>/</span>
                  <input
                    type="number"
                    placeholder="Bottom"
                    value={customBottom}
                    onChange={(e) => setCustomBottom(e.target.value)}
                    className="w-1/2 p-2 rounded bg-gray-700 border border-gray-600"
                    required
                  />
                </div>
              )}
            </div>

            <div>
              <label>Tempo :</label>
              <input
                type="number"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                required
              />
            </div>

            <div>
              <label>Description / Genre :</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full p-2 rounded bg-gray-700 border border-gray-600"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 p-2 rounded font-bold"
              disabled={loading}
            >
              Enregistrer le beat
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
