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

    const currentPageBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
    const leftColumn = currentPageBeats.slice(0, 10);
    const rightColumn = currentPageBeats.slice(10, 20);

    return (
        <>
            <style>{`
        @keyframes voyant-clignote {
          0% { background-color: orange; }
          6.25% { background-color: transparent; }
          25% { background-color: orange; }
          31.25% { background-color: transparent; }
          50% { background-color: orange; }
          56.25% { background-color: transparent; }
          75% { background-color: blue; }
          81.25% { background-color: transparent; }
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
          left: 14px;
          transform: translateY(-50%);
          animation: voyant-clignote 4s infinite;
        }

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
          background-color: #4b5563;
          border-radius: 0.5rem;
        }
        .beat-container:hover {
          box-shadow: 0 0 10px rgba(255,255,255,0.2);
        }

        .icon-container {
          background-color: white;
          padding: 4px;
          border-radius: 8px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          flex-shrink: 0;
          box-shadow: 0 0 6px rgba(0, 0, 0, 0.1);
        }

        .icon-container img {
          width: 36px;
          height: 36px;
          object-fit: contain;
          border-radius: 4px;
          user-select: none;
          pointer-events: none;
        }

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

            <div className="min-h-screen bg-gradient-to-tr from-gray-900 via-gray-800 to-gray-900 text-white p-6 flex flex-col items-center">
                <h1 className="text-4xl font-extrabold mb-6 select-none drop-shadow-lg">
                    🎹 PSR MANAGER STYLE - Lecteur Full MIDI
                </h1>

                <div className="flex gap-1 mb-6 bg-[#111] px-3 py-2 rounded-md shadow-inner border border-gray-700">
                    {Array.from({ length: 11 }).map((_, i) => (
                        <div
                            key={i}
                            className="w-6 h-10 bg-gradient-to-b from-blue-500 to-gray-700 border border-gray-600 rounded-sm"
                        />
                    ))}
                    <div
                        className="w-6 h-10 bg-gradient-to-b from-blue-500 to-gray-700 border border-gray-600 rounded-sm relative"
                        title="Play"
                    >
                        <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">▶</span>
                    </div>
                </div>

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
                                        className={`beat-container rounded-lg transition-shadow
                      ${selectedBeat?.id === beat.id ? 'bg-blue-700 shadow-lg' : ''}`}
                                        title={`${beat.title} - ${beat.user?.username || 'Inconnu'}`}
                                    >
                                        <div className="icon-container">
                                            <img
                                                src={getIconPath(beat.title)}
                                                alt="Icône"
                                                draggable={false}
                                            />
                                        </div>
                                        <div className="flex flex-col flex-grow justify-center">
                                            <span className="font-semibold text-lg beat-text">{beat.title}</span>
                                            <span className="beat-subtext">
                                                {beat.signature} - {beat.tempo} BPM
                                            </span>
                                            <span className="beat-subtext italic">
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
                            className={`play-button inline-flex items-center justify-center px-8 py-3 rounded-full font-extrabold text-lg transition-colors duration-300 focus:outline-none focus:ring-4 focus:ring-green-400/50`}
                        >
                            {isLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Chargement...
                                </>
                            ) : isPlaying ? (
                                <>
                                    ⏹️ Stop
                                    <span className="voyant" />
                                </>
                            ) : (
                                <>▶️ Play</>
                            )}
                        </button>

                        <audio ref={audioRef} hidden />
                    </div>
                )}

                <div className="flex gap-3 mt-8 select-none">
                    <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(p - 1, 0))}
                        className={`px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 ${page === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Précédent
                    </button>
                    <button
                        disabled={(page + 1) * ITEMS_PER_PAGE >= beats.length}
                        onClick={() => setPage((p) => p + 1)}
                        className={`px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 ${(page + 1) * ITEMS_PER_PAGE >= beats.length ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Suivant
                    </button>
                </div>
            </div>
        </>
    );
}