import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';

export default function STYPlayerSM() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const navigate = useNavigate();

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
    return `/icons/${(sum % iconCount) + 1}.png`;
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
      alert('⚠️ Veuillez sélectionner un beat.');
      return;
    }
    if (isPlaying) {
      stopPlayback();
      return;
    }
    setIsLoading(true);
    const token = localStorage.getItem('token');

    try {
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
      console.error('Erreur lecture :', error);
      alert('❌ Erreur lors de la lecture du beat.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        /* Animation voyant clignotant */
        @keyframes voyant-clignote {
          0% { background-color: orange; }
          5% { background-color: transparent; }
          15% { background-color: orange; }
          20% { background-color: transparent; }
          30% { background-color: orange; }
          35% { background-color: transparent; }
          40% { background-color: blue; }
          45% { background-color: transparent; }
          100% { background-color: transparent; }
        }
        .play-button {
          background-color: white !important;
          color: black !important;
          position: relative;
        }
        .play-button .voyant {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 16px;
          transform: translateY(-50%);
          /* Animation clignote seulement si lecture en cours */
          animation: voyant-clignote 3s infinite;
          animation-play-state: paused;
        }
        /* Activer animation quand isPlaying = true */
        .play-button.playing .voyant {
          animation-play-state: running;
        }

        /* Conteneur blanc opaque autour des icônes (modif ici) */
        .icon-container {
          background-color: white; /* blanc opaque */
          padding: 4px;
          border-radius: 8px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 12px;
          box-shadow: 0 0 6px rgba(0, 0, 0, 0.1); /* légère ombre */
        }
        .icon-container img {
          width: 36px;
          height: 36px;
          object-fit: contain;
          border-radius: 4px;
          user-select: none;
          pointer-events: none;
        }

        /* Réduction hauteur conteneur beat à 1.5cm */
        .beat-container {
          height: 1.5cm;
          max-height: 1.5cm;
          min-height: 1.5cm;
          padding: 0.3rem 1rem;
          overflow: hidden;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: box-shadow 0.2s ease;
          border-radius: 0.5rem;
        }
        .beat-container:hover {
          box-shadow: 0 0 10px rgba(255,255,255,0.2);
        }

        /* Ajuster texte pour éviter dépassement hauteur */
        .beat-text {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        .beat-subtext {
          font-size: 0.7rem;
          color: #d1d5db;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 flex flex-col">
        <h1 className="text-2xl font-extrabold mb-6 text-center select-none drop-shadow-lg">
          🎧 PSR MANAGER STYLE - Mobile
        </h1>

        <div className="flex-grow overflow-auto space-y-3 mb-6">
          {beats.length === 0 ? (
            <p className="text-center text-gray-400 italic">Aucun beat disponible</p>
          ) : (
            beats.map((beat) => (
              <div
                key={beat.id}
                onClick={() => setSelectedBeat(beat)}
                className={`beat-container transition-shadow ${
                  selectedBeat?.id === beat.id
                    ? 'bg-blue-700 shadow-lg'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
                title={`${beat.title} — ${beat.user?.username || 'Inconnu'}`}
              >
                <div className="icon-container">
                  <img
                    src={getIconPath(beat.title)}
                    alt="Icone"
                    draggable={false}
                  />
                </div>
                <div className="flex flex-col flex-grow truncate justify-center">
                  <span className="font-semibold text-lg beat-text truncate">{beat.title}</span>
                  <span className="beat-subtext truncate">
                    {beat.signature} — {beat.tempo} BPM
                  </span>
                  <span className="beat-subtext italic truncate">
                    Par : {beat.user?.username || 'Inconnu'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedBeat && (
          <div className="bg-gray-800 rounded-xl p-5 shadow-lg text-center select-none">
            <h2 className="text-xl font-bold mb-3">{selectedBeat.title}</h2>
            <p className="text-gray-400 mb-4">{selectedBeat.description || 'Pas de description'}</p>

            <button
              onClick={togglePlay}
              disabled={isLoading}
              className={`play-button inline-flex items-center justify-center px-10 py-3 rounded-full font-extrabold text-lg transition-colors duration-300 focus:outline-none focus:ring-4 focus:ring-green-400/50 ${
                isPlaying ? 'playing' : ''
              }`}
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-6 w-6 text-black"
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
                <>
                  ⏹️ Stop
                  <span className="voyant" />
                </>
              ) : (
                <>
                  ▶️ Play
                  {/* Voyant visible mais sans animation */}
                  <span className="voyant" style={{ animationPlayState: 'paused', backgroundColor: 'transparent' }} />
                </>
              )}
            </button>

            <audio ref={audioRef} hidden />
          </div>
        )}
      </div>
    </>
  );
}
