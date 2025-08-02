// STYPlayerFull.js
// Auteur : Ton nom ou pseudo ici
// Description : Lecteur full midi, un seul bouton Play par beat, design moderne

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';

export default function STYPlayerFull() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;
  const [page, setPage] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/auth');
    axios
      .get(`${BACKEND_URL}/api/beats/public`)
      .then((res) => {
        const sorted = res.data.beats.sort((a, b) => a.title.localeCompare(b.title));
        setBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  const getIconPath = (title) => {
    const iconCount = 10;
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    const index = (sum % iconCount) + 1;
    return `/icons/${index}.png`;
  };

  const handleSelectBeat = (beat) => {
    if (isPlaying) {
      stopPlayback();
    }
    setSelectedBeat(beat);
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setIsPlaying(false);
    setIsLoading(false);
  };

  const togglePlay = async () => {
    if (!selectedBeat) {
      alert('⚠️ Veuillez sélectionner un beat avant de jouer.');
      return;
    }
    if (isPlaying) {
      stopPlayback();
      return;
    }

    setIsLoading(true);
    const token = localStorage.getItem('token');

    try {
      // On envoie juste le beatId, backend doit retrouver le fichier sty complet
      const response = await axios.post(
        `${BACKEND_URL}/api/player/play-full`,
        { beatId: selectedBeat.id },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.loop = true;
        await audioRef.current.play();
      }
      setIsPlaying(true);
    } catch (error) {
      console.error('❌ Erreur lecture:', error);
      alert('Erreur lors de la lecture du beat. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  // Pagination
  const currentPageBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leftColumn = currentPageBeats.slice(0, 10);
  const rightColumn = currentPageBeats.slice(10, 20);

  return (
    <div className="min-h-screen bg-gradient-to-tr from-gray-900 via-gray-800 to-gray-900 text-white p-6 flex flex-col items-center">
      <h1 className="text-4xl font-extrabold mb-6 select-none drop-shadow-lg">
        🎹 PSR MANAGER STYLE - Lecteur Full MIDI
      </h1>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {[leftColumn, rightColumn].map((column, colIdx) => (
          <div key={colIdx} className="space-y-3">
            {column.length === 0 ? (
              <p className="text-gray-400 text-center italic">Aucun beat disponible</p>
            ) : (
              column.map((beat) => (
                <div
                  key={beat.id}
                  onClick={() => handleSelectBeat(beat)}
                  className={`flex items-center p-3 rounded-lg cursor-pointer transition-shadow
                    ${
                      selectedBeat?.id === beat.id
                        ? 'bg-blue-700 shadow-lg'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  title={`${beat.title} - ${beat.user?.username || 'Inconnu'}`}
                >
                  <img
                    src={getIconPath(beat.title)}
                    alt="Icône"
                    className="w-12 h-12 rounded-md mr-4 object-contain"
                    draggable={false}
                  />
                  <div className="flex flex-col flex-grow">
                    <span className="font-semibold text-lg truncate">{beat.title}</span>
                    <span className="text-sm text-gray-300 truncate">
                      {beat.signature} - {beat.tempo} BPM
                    </span>
                    <span className="text-xs text-gray-400 italic truncate">
                      Par : {beat.user?.username || 'Inconnu'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {selectedBeat && (
        <div className="w-full max-w-3xl bg-gray-800 rounded-xl p-6 shadow-lg text-center select-none">
          <h2 className="text-2xl font-bold mb-2">{selectedBeat.title}</h2>
          <p className="text-gray-400 mb-4">{selectedBeat.description || 'Pas de description'}</p>

          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={`inline-flex items-center justify-center px-8 py-3 rounded-full font-extrabold text-lg
              transition-colors duration-300
              ${
                isPlaying
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }
              focus:outline-none focus:ring-4 focus:ring-green-400/50`}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-6 w-6 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                Chargement...
              </>
            ) : isPlaying ? (
              '⏹️ Stop'
            ) : (
              '▶️ Play'
            )}
          </button>

          <audio ref={audioRef} hidden />
        </div>
      )}

      {/* Pagination controls */}
      <div className="flex gap-3 mt-8 select-none">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          className={`px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 ${
            page === 0 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Précédent
        </button>
        <button
          disabled={(page + 1) * ITEMS_PER_PAGE >= beats.length}
          onClick={() => setPage((p) => p + 1)}
          className={`px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 ${
            (page + 1) * ITEMS_PER_PAGE >= beats.length ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
