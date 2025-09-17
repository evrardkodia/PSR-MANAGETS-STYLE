import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

axios.defaults.baseURL = 'https://psr-manager-beat.onrender.com';

// 🔹 Connexion à Supabase
const supabase = createClient(
  'https://swtbkiudmfvnywcgpzfe.supabase.co',
  process.env.REACT_APP_SUPABASE_KEY // ⚠️ Clé publique dans .env (REACT_APP_SUPABASE_KEY)
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

  // 🔸 Progress UI
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);          // 0..100
  const [statusText, setStatusText] = useState('');     // Libellé d’étape
  const uploadedCountRef = useRef(0);                   // Pour compter les fichiers Supabase

  const navigate = useNavigate();

  const fmtPct = (val) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));

  // Pondération des étapes (modifiable à volonté)
  const UPLOAD_MAX = 40;   // upload .sty  => 0 → 40 %
  const PREP_MAX   = 70;   // préparation  => 40 → 70 %
  // Supabase       => 70 → 100 %

  const handleFileUpload = (e) => {
    setFile(e.target.files[0]);
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file || !title) {
      alert('Fichier et titre requis !');
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
    setStatusText('Téléversement du fichier .sty…');

    try {
      const token = localStorage.getItem('token');

      // 1️⃣ Upload du .sty (progression réelle via onUploadProgress)
      const uploadRes = await axios.post('/api/beats/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (ev) => {
          if (!ev.total) return; // fallback si pas de total
          const ratio = ev.loaded / ev.total;
          const pct = ratio * UPLOAD_MAX;
          setProgress(clamp(pct));
        },
      });

      setProgress(UPLOAD_MAX);
      const beatId = uploadRes.data.id;

      // 2️⃣ Préparation côté backend (palier)
      setStatusText('Préparation des sections…');
      // Option simple : pas de progression de bytes, on passe à 70% quand c’est fini
      await axios.post(
        '/api/player/prepare-all-sections',
        { beatId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProgress(PREP_MAX);

      // 3️⃣ Récupération des sections générées
      // ⚠️ selon ton backend, la réponse précédente peut déjà contenir les sections.
      // Si c’est le cas, utilise son payload. Ici, on refait un GET "propre" si nécessaire.
      // Pour rester fidèle à ton code d’origine :
      const prepareRes = await axios.post(
        '/api/player/prepare-all-sections',
        { beatId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const generatedFiles = prepareRes.data.sections || [];
      const total = generatedFiles.length || 1; // éviter division par zéro
      uploadedCountRef.current = 0;

      setStatusText(`Envoi sur Supabase (0/${total})…`);

      // 4️⃣ Upload Supabase (réparti sur 30 % restants)
      const startPct = PREP_MAX;
      const endPct = 100;
      const span = endPct - startPct;

      for (const fileObj of generatedFiles) {
        const fileUrl = fileObj.url;
        const fileName = fileObj.midFilename;

        // Petit palier visuel en début de fichier (donne une sensation de mouvement)
        const nextIndex = uploadedCountRef.current + 1;
        const nextPctStart = startPct + (span * (uploadedCountRef.current + 0.3)) / total;
        setProgress(clamp(nextPctStart));
        setStatusText(`Envoi sur Supabase (${uploadedCountRef.current}/${total})…`);

        try {
          const fileBlob = await fetch(fileUrl).then((res) => res.blob());

          const { error } = await supabase.storage
            .from('midiAndWav')
            .upload(`${beatId}/${fileName}`, fileBlob, {
              cacheControl: '3600',
              upsert: true,
            });

          if (error) {
            console.error(`Erreur upload Supabase pour ${fileName}:`, error);
          } else {
            uploadedCountRef.current += 1;
            const donePct = startPct + (span * uploadedCountRef.current) / total;
            setProgress(clamp(donePct));
            setStatusText(`Envoi sur Supabase (${uploadedCountRef.current}/${total})…`);
          }
        } catch (fetchErr) {
          console.error(`Erreur fetch pour ${fileName}:`, fetchErr);
        }
      }

      setProgress(100);
      setStatusText('Terminé ✅');

      alert('Beat ajouté et fichiers envoyés sur Supabase ✅');
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setStatusText('Erreur');
      alert(err.response?.data?.error || 'Erreur lors de l’envoi ou de la préparation');
    } finally {
      // Petit délai optionnel pour laisser voir "100,00 %"
      setTimeout(() => setLoading(false), 300);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 relative">
      {/* Overlay de progression */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-50">
          <div className="w-full max-w-md bg-gray-800/80 rounded-xl p-6 shadow-2xl border border-gray-700">
            <div className="mb-4 text-sm text-gray-300">{statusText}</div>

            <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${clamp(progress)}%` }}
              />
            </div>

            <div className="mt-3 text-right text-lg font-semibold tabular-nums">
              {fmtPct(progress)} %
            </div>

            <ul className="mt-4 text-xs text-gray-400 space-y-1">
              <li>
                {progress >= 1 ? '✔️' : '⏳'} Téléversement du .sty
              </li>
              <li>
                {progress >= UPLOAD_MAX + 1 ? '✔️' : '⏳'} Préparation des sections
              </li>
              <li>
                {progress >= PREP_MAX + 1 ? '✔️' : '⏳'} Envoi sur Supabase
              </li>
            </ul>
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
