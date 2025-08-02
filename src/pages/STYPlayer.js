// STYPlayer.js
// Auteur : Ton nom ou pseudo ici
// Description : Affiche tous les beats de tous les utilisateurs avec nom d'auteur
//              Permet sélection, contrôle avancé, lecture, pagination, et filtres.

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';

export default function STYPlayer() {
  // États
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredBeats, setFilteredBeats] = useState([]);
  const [controls, setControls] = useState({
    acmp: false,
    autofill: false,
    intro: '',
    main: 'A',
    ending: '',
    play: false,
    disabledChannels: [11, 12, 13, 14, 15, 16],
    volume: 0.8,
    balance: 0, // -1 left, 0 center, +1 right
  });
  const [mainBlinking, setMainBlinking] = useState(null);
  const [playColor, setPlayColor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Références
  const playTimerRef = useRef(null);
  const blinkStepIndex = useRef(0);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;

  // Séquence clignotante pour play button
  const blinkSequence = [
    { color: 'blue', duration: 100 },
    { color: null, duration: 500 },
    { color: 'orange', duration: 100 },
    { color: null, duration: 500 },
    { color: 'orange', duration: 100 },
    { color: null, duration: 500 },
    { color: 'orange', duration: 100 },
    { color: null, duration: 500 },
  ];

  // Effet pour clignotement play
  useEffect(() => {
    if (controls.play) {
      blinkStepIndex.current = 0;
      const runBlink = () => {
        const step = blinkSequence[blinkStepIndex.current];
        setPlayColor(step.color);
        playTimerRef.current = setTimeout(() => {
          blinkStepIndex.current = (blinkStepIndex.current + 1) % blinkSequence.length;
          runBlink();
        }, step.duration);
      };
      runBlink();
    } else {
      clearTimeout(playTimerRef.current);
      setPlayColor(null);
    }
    return () => clearTimeout(playTimerRef.current);
  }, [controls.play]);

  // Chargement des beats à l'initialisation
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/auth');
    axios
      .get(`${BACKEND_URL}/api/beats/public`)
      .then((res) => {
        const sorted = res.data.beats.sort((a, b) => a.title.localeCompare(b.title));
        setBeats(sorted);
        setFilteredBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  // Filtrer beats selon recherche
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredBeats(beats);
    } else {
      const lowered = searchTerm.toLowerCase();
      setFilteredBeats(
        beats.filter(
          (b) =>
            b.title.toLowerCase().includes(lowered) ||
            (b.user?.username || '').toLowerCase().includes(lowered)
        )
      );
      setPage(0);
    }
  }, [searchTerm, beats]);

  // Icone aléatoire selon titre
  const getIconPath = (title) => {
    const iconCount = 10;
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    const index = (sum % iconCount) + 1;
    return `/icons/${index}.png`;
  };

  // Lecture / arrêt du beat sélectionné
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }
    if (!selectedBeat.filename) {
      alert('⚠️ Le beat sélectionné n’a pas de fichier .sty associé.');
      return;
    }

    const token = localStorage.getItem('token');
    let section = `Main ${controls.main}`;
    if (controls.intro) section = `Intro ${controls.intro}`;
    else if (controls.ending) section = `Ending ${controls.ending}`;

    if (controls.play && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      try {
        await axios.post(
          `${BACKEND_URL}/api/player/cleanup`,
          { beatId: selectedBeat.id, section },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        console.warn('⚠️ Cleanup fail:', err.message || err);
      }
      setControls((prev) => ({ ...prev, play: false }));
      setPlayColor(null);
      clearTimeout(playTimerRef.current);
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/player/play-section`,
        {
          beatId: selectedBeat.id,
          section,
          acmpEnabled: controls.acmp,
          disabledChannels: controls.disabledChannels,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );
      const blob = new Blob([response.data], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = true;
        audioRef.current.volume = controls.volume;
        await audioRef.current.play();
      }
      setControls((prev) => ({ ...prev, play: true }));
    } catch (err) {
      console.error('❌ Lecture échouée :', err.message || err);
      alert('❌ Lecture échouée. Fichier .sty peut-être manquant ou invalide.');
    } finally {
      setIsLoading(false);
    }
  };

  // Sélection d’un beat dans la liste
  const handleSelectBeat = (beat) => {
    if (!beat.filename) {
      alert("⚠️ Ce beat n'a pas de fichier .sty associé.");
      return;
    }
    setSelectedBeat(beat);
    setControls({
      acmp: false,
      autofill: false,
      intro: '',
      main: 'A',
      ending: '',
      play: false,
      disabledChannels: [11, 12, 13, 14, 15, 16],
      volume: 0.8,
      balance: 0,
    });
    setMainBlinking(null);
    setPlayColor(null);
    clearTimeout(playTimerRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  };

  // Gérer clics sur les contrôles
  const handleControlClick = (type, value = null) => {
    if (type === 'main') {
      const newMain = value;
      const isAlreadyPlaying = controls.play;

      if (isAlreadyPlaying && controls.autofill) {
        const token = localStorage.getItem('token');
        axios.post(
          `${BACKEND_URL}/api/player/fill-then-main`,
          {
            beatId: selectedBeat.id,
            mainLetter: newMain,
            acmpEnabled: controls.acmp,
            disabledChannels: controls.disabledChannels,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      setMainBlinking(newMain);
      setControls((prev) => ({ ...prev, main: newMain }));
      setTimeout(() => setMainBlinking(null), 2000);
      return;
    }

    if (type === 'play') {
      togglePlay();
      return;
    }

    if (type === 'volume') {
      setControls((prev) => ({ ...prev, volume: value }));
      if (audioRef.current) audioRef.current.volume = value;
      return;
    }

    if (type === 'balance') {
      setControls((prev) => ({ ...prev, balance: value }));
      // Pour le balance, on pourrait implémenter un Web Audio API pannerNode ici plus tard
      return;
    }

    setControls((prev) => {
      const updated = { ...prev };
      if (type === 'acmp' || type === 'autofill') updated[type] = !prev[type];
      else if (type === 'intro') {
        updated.intro = prev.intro === value ? '' : value;
        updated.ending = '';
      } else if (type === 'ending') {
        updated.ending = prev.ending === value ? '' : value;
        updated.intro = '';
      } else if (type === 'disableChannel') {
        // Toggle channel disabled/enabled
        const chan = value;
        const arr = new Set(updated.disabledChannels);
        if (arr.has(chan)) arr.delete(chan);
        else arr.add(chan);
        updated.disabledChannels = Array.from(arr).sort((a, b) => a - b);
      }
      return updated;
    });
  };

  // Pagination controls
  const maxPage = Math.floor(filteredBeats.length / ITEMS_PER_PAGE);
  const goToNextPage = () => {
    setPage((p) => (p < maxPage ? p + 1 : p));
  };
  const goToPrevPage = () => {
    setPage((p) => (p > 0 ? p - 1 : 0));
  };

  // Beats à afficher page courante
  const currentPageBeats = filteredBeats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leftColumn = currentPageBeats.slice(0, 10);
  const rightColumn = currentPageBeats.slice(10, 20);

  // Affichage d’une carte de beat
  const renderBeatCard = (beat) => (
    <div
      key={beat.id}
      onClick={() => handleSelectBeat(beat)}
      className={`flex items-center gap-3 cursor-pointer p-2 mb-2 rounded-md transition hover:bg-blue-700 ${
        selectedBeat?.id === beat.id ? 'bg-blue-800' : 'bg-[#3a3a3a]'
      }`}
      title={`Par : ${beat.user?.username || 'inconnu'}`}
    >
      <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm">
        <img src={getIconPath(beat.title)} alt="icon" className="w-8 h-8 object-contain" />
      </div>
      <div className="overflow-hidden">
        <p className="font-semibold truncate">{beat.title}</p>
        <p className="text-sm text-gray-400 truncate">
          {beat.signature} - {beat.tempo} BPM
        </p>
        <p className="text-xs text-gray-400 italic truncate">Par : {beat.user?.username || 'inconnu'}</p>
      </div>
    </div>
  );

  // Boutons avec styles avancés
  const renderButton = (type, label, isActive, onClick, isBlinking = false) => {
    let colorClass = 'bg-transparent';
    if (type === 'acmp' || type === 'autofill') {
      colorClass = isActive ? 'bg-orange-400 glow' : 'bg-black';
    } else if (type === 'main') {
      colorClass = isBlinking ? 'animate-orange-blue-blink' : isActive ? 'bg-blue-500 glow' : 'bg-orange-400';
    } else {
      colorClass = isActive ? 'bg-orange-400 glow' : 'bg-transparent';
    }

    return (
      <div onClick={onClick} className="flex flex-col items-center cursor-pointer select-none" role="button" tabIndex={0} onKeyPress={(e) => { if(e.key === 'Enter') onClick(); }}>
        <div className={`w-8 h-2 mb-1 rounded-sm transition-all duration-300 ${colorClass}`} />
        <button
          className="text-white bg-[#333] w-16 h-[60px] rounded-md font-bold"
          style={{ fontSize: type === 'main' ? '1.2rem' : '0.65rem' }}
          aria-pressed={isActive}
          aria-label={label}
          type="button"
        >
          {label}
        </button>
      </div>
    );
  };

  // Contrôle des canaux (channels) désactivés (11 à 16)
  const renderChannelToggles = () => {
    const channels = [11, 12, 13, 14, 15, 16];
    return (
      <div className="flex gap-2 justify-center flex-wrap mt-3">
        {channels.map((ch) => {
          const disabled = controls.disabledChannels.includes(ch);
          return (
            <button
              key={ch}
              onClick={() => handleControlClick('disableChannel', ch)}
              className={`px-3 py-1 rounded-md font-semibold ${
                disabled ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
              }`}
              type="button"
              aria-pressed={disabled}
              aria-label={`Canal ${ch} ${disabled ? 'désactivé' : 'activé'}`}
            >
              {`Canal ${ch}`}
            </button>
          );
        })}
      </div>
    );
  };

  // Contrôle du volume (slider)
  const renderVolumeControl = () => (
    <div className="flex items-center justify-center mt-4 gap-4">
      <label htmlFor="volumeRange" className="text-gray-400">Volume</label>
      <input
        id="volumeRange"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={controls.volume}
        onChange={(e) => handleControlClick('volume', parseFloat(e.target.value))}
        className="w-48"
      />
      <span className="text-gray-300">{Math.round(controls.volume * 100)}%</span>
    </div>
  );

  // Barre de recherche simple
  const renderSearchBar = () => (
    <div className="max-w-5xl mx-auto mb-6 flex justify-center">
      <input
        type="text"
        placeholder="Rechercher un beat par titre ou auteur..."
        className="w-full max-w-md p-2 rounded-md bg-[#2a2a2a] border border-gray-600 text-white focus:outline-none focus:border-blue-500"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        aria-label="Recherche des beats"
      />
    </div>
  );

  // Pagination controls
  const renderPagination = () => (
    <div className="max-w-5xl mx-auto flex justify-center gap-4 mt-4">
      <button
        onClick={goToPrevPage}
        disabled={page === 0}
        className={`px-4 py-2 rounded-md font-semibold ${
          page === 0 ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
        } text-white`}
        type="button"
      >
        ← Précédent
      </button>
      <span className="text-gray-400 self-center">
        Page {page + 1} / {maxPage + 1}
      </span>
      <button
        onClick={goToNextPage}
        disabled={page >= maxPage}
        className={`px-4 py-2 rounded-md font-semibold ${
          page >= maxPage ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
        } text-white`}
        type="button"
      >
        Suivant →
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6 select-none">
      <audio ref={audioRef} hidden />
      <h1 className="text-3xl font-bold text-center mb-4">🎧 PSR MANAGER STYLE</h1>

      {renderSearchBar()}

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner min-h-[500px] overflow-y-auto">
          {leftColumn.length === 0 ? (
            <p className="text-gray-400 text-center mt-10">Aucun beat disponible</p>
          ) : (
            leftColumn.map(renderBeatCard)
          )}
        </div>
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner min-h-[500px] overflow-y-auto">
          {rightColumn.length === 0 ? (
            <p className="text-gray-400 text-center mt-10">Rien à afficher</p>
          ) : (
            rightColumn.map(renderBeatCard)
          )}
        </div>
      </div>

      {renderPagination()}

      {selectedBeat && (
        <div className="bg-[#2a2a2a] p-6 rounded-xl text-center space-y-4 max-w-3xl mx-auto mt-8 shadow-lg">
          <h2 className="text-2xl font-semibold">{selectedBeat.title}</h2>
          <p className="text-gray-400">Tempo : {selectedBeat.tempo} BPM</p>
          <p className="text-gray-400">Signature : {selectedBeat.signature}</p>
          <p className="text-gray-400">Description : {selectedBeat.description || 'Aucune'}</p>

          <div className="flex flex-nowrap overflow-x-auto justify-center gap-2 mt-6 bg-[#1c1c1c] p-3 rounded-lg select-auto">
            {renderButton('acmp', 'ACMP', controls.acmp, () => handleControlClick('acmp'))}
            {renderButton('autofill', 'AUTO-FILL', controls.autofill, () => handleControlClick('autofill'))}
            {['A', 'B', 'C', 'D'].map((i) =>
              renderButton('intro', `INTRO ${i}`, controls.intro === i, () => handleControlClick('intro', i))
            )}
            {['A', 'B', 'C', 'D'].map((m) =>
              renderButton('main', m, controls.main === m, () => handleControlClick('main', m), mainBlinking === m)
            )}
            {['A', 'B', 'C', 'D'].map((i) =>
              renderButton('ending', `END ${i}`, controls.ending === i, () => handleControlClick('ending', i))
            )}

            <div className="flex flex-col items-center cursor-pointer select-none" onClick={() => handleControlClick('play')} role="button" tabIndex={0} onKeyPress={(e) => { if(e.key === 'Enter') handleControlClick('play'); }}>
              <div
                className={`w-8 h-2 mb-1 rounded-sm ${
                  playColor === 'blue'
                    ? 'bg-blue-500 glow'
                    : playColor === 'orange'
                    ? 'bg-orange-400 glow'
                    : 'bg-black'
                }`}
              />
              <button
                className="text-[10px] bg-gray-300 hover:bg-gray-400 text-black w-16 h-[60px] rounded-md font-bold"
                disabled={isLoading}
                type="button"
                aria-pressed={controls.play}
                aria-label={controls.play ? 'Arrêter la lecture' : 'Démarrer la lecture'}
              >
                {isLoading ? '⏳' : controls.play ? '⏹ STOP' : '▶️ PLAY'}
              </button>
            </div>
          </div>

          {renderChannelToggles()}

          {renderVolumeControl()}
        </div>
      )}

      <style>
        {`
          .glow {
            box-shadow: 0 0 8px 3px currentColor;
          }
          @keyframes orangeBlueBlink {
            0%, 100% { background-color: orange; }
            50% { background-color: blue; }
          }
          .animate-orange-blue-blink {
            animation: orangeBlueBlink 1s infinite;
          }
          /* Scrollbar custom */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #1a1a1a;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #555;
            border-radius: 4px;
          }
        `}
      </style>
    </div>
  );
}
