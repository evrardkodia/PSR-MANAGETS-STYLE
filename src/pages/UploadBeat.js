import React, { useEffect, useRef, useState } from 'react';
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

  // ==== Helpers progression ====
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const rafRef = useRef(null);
  const stopAnim = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };

  // animation douce vers une cible (passe par toutes les valeurs)
  const animateTo = (target, duration = 800) => {
    stopAnim();
    const start = performance.now();
    const from = progress;
    const to = Math.max(from, target); // jamais en arrière
    const diff = to - from;
    if (diff <= 0) { setProgress(clamp(to)); return; }
    const easeInOutQuad = (t) => (t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t);

    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = easeInOutQuad(p);
      const val = from + diff * eased;
      setProgress(clamp(val));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // animation lente « indéterminée » qui grimpe jusqu’à un cap (ex: 69%)
  const indeterminateTo = (cap = 69, speedPerSec = 12) => {
    stopAnim();
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setProgress((prev) => {
        if (prev >= cap) return prev;
        const next = prev + speedPerSec * dt; // ex: +12%/s
        return clamp(Math.min(next, cap));
      });
      if (progress < cap) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // téléchargement streaming avec progression (si Content-Length dispo)
  async function downloadWithProgress(url, onProgress) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = parseInt(res.headers.get('Content-Length') || '0', 10);
    const reader = res.body?.getReader?.();
    if (!reader) {
      // Pas de streaming dispo → fallback direct
      const blob = await res.blob();
      onProgress?.(1, 1); // 100%
      return blob;
    }
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) onProgress?.(received, total);
      else onProgress?.(received, undefined); // total inconnu
    }
    return new Blob(chunks);
  }

  // ==== paliers visuels ====
  // Upload .sty : 0 → 55 (réel + lissage)
  // Préparation serveur : 55 → 70 (indéterminé + palier fin)
  // Supabase : 70 → 100 (streaming + animation upload)
  const UI_STEPS = {
    UPLOAD_START: 0,
    UPLOAD_END: 55,
    PREP_END: 70,
    SUPABASE_END: 100,
  };

  useEffect(() => () => stopAnim(), []); // cleanup

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

      // 1️⃣ Upload du beat (progress réel + lissage)
      setProgressLabel('Upload du fichier .sty…');
      const uploadRes = await axios.post('/api/beats/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data', // laissé tel quel (tu voulais garder les requêtes)
        },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const ratio = evt.loaded / evt.total; // 0..1
          const target = UI_STEPS.UPLOAD_START + ratio * (UI_STEPS.UPLOAD_END - UI_STEPS.UPLOAD_START);
          animateTo(target, 120); // lissage rapide pour ne pas sauter des % entiers
        },
        timeout: 120000,
      });

      const beatId = uploadRes.data.id;
      animateTo(UI_STEPS.UPLOAD_END, 150);
      setProgressLabel('Génération des MID/WAV sur le serveur…');

      // 2️⃣ Préparation serveur (indéterminée jusqu’à 69%, puis palier à 70% à la fin)
      indeterminateTo(69, 10);
      const prepareRes = await axios.post('/api/player/prepare-all-sections', { beatId }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 300000,
      });

      const generatedFiles = prepareRes.data.sections || [];
      animateTo(UI_STEPS.PREP_END, 200);
      setProgressLabel(`Préparation terminée (${generatedFiles.length} éléments). Envoi vers Supabase…`);

      // 3️⃣ Upload sur Supabase (progress continue 70→100)
      const total = generatedFiles.length || 1;
      let base = UI_STEPS.PREP_END;
      const span = UI_STEPS.SUPABASE_END - UI_STEPS.PREP_END; // 30
      const perFile = span / total;

      for (let i = 0; i < generatedFiles.length; i++) {
        const fileObj = generatedFiles[i];
        const fileUrl = fileObj.url;          // source (serveur)
        const fileName = fileObj.midFilename; // destination (bucket)
        const startForThis = base + i * perFile;
        const endForThis = base + (i + 1) * perFile;
        let lastShown = startForThis;

        try {
          // 3.a Téléchargement en streaming (progress connue si Content-Length exposé)
          setProgressLabel(`Téléchargement ${i + 1}/${total}…`);
          const blob = await downloadWithProgress(fileUrl, (loaded, totalBytes) => {
            if (!totalBytes) {
              // total inconnu → avance doucement mais en continu (jusqu’à ~80% de la part)
              const target = startForThis + (endForThis - startForThis) * 0.8;
              const stepTarget = Math.min(target, lastShown + 0.6);
              lastShown = stepTarget;
              animateTo(stepTarget, 120);
            } else {
              const ratio = loaded / totalBytes;
              const target = startForThis + ratio * (endForThis - startForThis) * 0.8; // 0..80% de la tranche
              if (target > lastShown) {
                lastShown = target;
                animateTo(target, 100);
              }
            }
          });

          // 3.b Upload vers Supabase (pas de progress callback → anime le reste de 80%→100% de la tranche)
          setProgressLabel(`Envoi Supabase ${i + 1}/${total}…`);
          // anime vers 95% de la tranche pendant l’upload
          animateTo(startForThis + (endForThis - startForThis) * 0.95, 500);

          const { error } = await supabase
            .storage
            .from('midiAndWav')
            .upload(`${prepareRes.data.beatId || beatId}/${fileName}`, blob, {
              cacheControl: '3600',
              upsert: true
            });

          if (error) {
            console.error(`Erreur upload Supabase pour ${fileName}:`, error);
          }

          // fin de tranche à 100%
          animateTo(endForThis, 250);
        } catch (errFile) {
          console.error(`Erreur sur ${fileObj.midFilename}:`, errFile);
          // même en cas d’erreur, on marque la tranche comme « passée » pour garder une progression cohérente
          animateTo(endForThis, 150);
        }
      }

      animateTo(100, 250);
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
    } finally {
      stopAnim();
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
                className="bg-blue-500 h-3 transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-gray-300">{progressLabel || '…'}</span>
              <span className="text-sm font-mono">{clamp(progress)}%</span>
            </div>

            {/* Mini stepper d’étapes */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-300">
              <div className={`p-2 rounded ${progress >= 1 ? 'bg-gray-700' : 'bg-gray-800'}`}>1) Upload .sty</div>
              <div className={`p-2 rounded ${progress >= 56 ? 'bg-gray-700' : 'bg-gray-800'}`}>2) Préparation</div>
              <div className={`p-2 rounded ${progress >= 71 ? 'bg-gray-700' : 'bg-gray-800'}`}>3) Supabase</div>
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
