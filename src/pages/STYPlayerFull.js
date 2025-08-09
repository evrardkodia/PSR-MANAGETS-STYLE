import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function STYPlayer() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [page, setPage] = useState(0);
  const [controls, setControls] = useState({
    acmp: false,
    autofill: false,
    intro: '',
    main: 'A',
    ending: '',
    play: false,
    disabledChannels: [11, 12, 13, 14, 15, 16],
  });
  const [availableSections, setAvailableSections] = useState({}); // { "Main A": "/temp/..", ... }
  const [mainBlinking, setMainBlinking] = useState(null);
  const [playColor, setPlayColor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [wavUrl, setWavUrl] = useState(null); // optional diagnostic

  const playTimerRef = useRef(null);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;

  // blink sequence (unchanged)
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

  // Play button blinking effect
  useEffect(() => {
    if (controls.play) {
      let index = 0;
      const run = () => {
        const step = blinkSequence[index];
        setPlayColor(step.color);
        playTimerRef.current = setTimeout(() => {
          index = (index + 1) % blinkSequence.length;
          run();
        }, step.duration);
      };
      run();
    } else {
      clearTimeout(playTimerRef.current);
      setPlayColor(null);
    }
    return () => clearTimeout(playTimerRef.current);
  }, [controls.play]);

  // Load beats on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth');
      return;
    }
    axios
      .get('/api/beats/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const sorted = res.data.beats.sort((a, b) => a.title.localeCompare(b.title));
        setBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);

  // Helpers to construct section names
  const introName = (letter) => `Intro ${letter}`;
  const mainName = (letter) => `Main ${letter}`;
  const endingName = (letter) => `Ending ${letter}`;
  const fillName = (code) => `Fill In ${code}`; // code: AA, BB, CC, DD

  // Determine enabled/disabled
  const isSectionAvailable = (sectionName) => !!availableSections[sectionName];
  const sectionWavUrl = (sectionName) => availableSections[sectionName] || null;

  // Select beat -> call prepare-all (extract all sections + convert to wav)
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);
    setAvailableSections({}); // Reset available sections
    setWavUrl(null);

    // Reset controls
    setControls({
      acmp: false,
      autofill: false,
      intro: '',
      main: 'A',
      ending: '',
      play: false,
      disabledChannels: [11, 12, 13, 14, 15, 16],
    });
    setMainBlinking(null);
    setPlayColor(null);
    clearTimeout(playTimerRef.current);

    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }

    try {
      const token = localStorage.getItem('token');
      // Call prepare-all: server will extract all sections and return which ones are available
      const response = await axios.post(
        '/api/player/prepare-all',
        { beatId: beat.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Expect response.data.wavs with section and url
      const wavs = response.data?.wavs || [];
      const map = {};
      for (const item of wavs) {
        if (item.section && item.url) {
          // Replace spaces with underscores in the WAV URL to match naming convention
          const sectionName = item.section;
          const urlWithUnderscores = item.url.replace(/\s+/g, '_');
          map[sectionName] = urlWithUnderscores;  // Mise à jour avec le bon nom
        }
      }

      console.log('🔎 Sections extraites:', JSON.stringify(map, null, 2));
      setAvailableSections(map); // Mettre à jour les sections disponibles

      // Choisir le "Main" par défaut: préférer A, sinon choisir le premier Main disponible
      if (map[mainName('A')]) {
        setControls((prev) => ({ ...prev, main: 'A' }));
        setWavUrl(map[mainName('A')]);
      } else {
        // Trouver le premier "Main" disponible
        const mains = ['A', 'B', 'C', 'D'].find((m) => map[mainName(m)]);
        if (mains) {
          setControls((prev) => ({ ...prev, main: mains }));
          setWavUrl(map[mainName(mains)]);
        } else {
          setWavUrl(null);
        }
      }
    } catch (err) {
      console.error('❌ Échec prepare-all :', err);
      alert('Échec de l’extraction complète du style. Vérifie les logs serveurs.');
    } finally {
      setIsLoading(false);
    }
  };

  // Change main -> simply switch to that main if available (no re-prepare required)
  const handleChangeMain = async (newMain) => {
    if (isLoading || !selectedBeat) return;
    const sName = mainName(newMain);
    if (!isSectionAvailable(sName)) {
      console.warn(`Main ${newMain} non disponible`);
      return;
    }
    setMainBlinking(newMain);
    setControls((prev) => ({ ...prev, main: newMain }));
    setWavUrl(sectionWavUrl(sName));

    setTimeout(() => setMainBlinking(null), 1200);
  };

  // Play / stop using server play-section (keeps current behavior)
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }

    if (controls.play) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setControls((p) => ({ ...p, play: false }));
      setPlayColor(null);
      clearTimeout(playTimerRef.current);
      return;
    }

    // Ensure the section is available before asking server to play
    const chosenMain = controls.main;
    const section = mainName(chosenMain);
    const token = localStorage.getItem('token');

    if (!isSectionAvailable(section)) {
      alert(`🎯 Le main ${chosenMain} n'est pas disponible. Sélectionne-en un autre.`);
      return;
    }

    try {
      const playRes = await axios.post(
        '/api/player/play-section',
        { beatId: selectedBeat.id, mainLetter: chosenMain },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const serverWavUrl = playRes.data?.wavUrl || sectionWavUrl(section);
      if (!serverWavUrl) {
        alert('❌ WAV non disponible pour lecture.');
        return;
      }

      if (audioRef.current) {
        audioRef.current.src = serverWavUrl;
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = true;
        try {
          await audioRef.current.play();
          setControls((p) => ({ ...p, play: true }));
        } catch (err) {
          console.error('❌ audio play error', err);
          alert('Impossible de lancer la lecture audio.');
        }
      }
    } catch (err) {
      console.error('❌ /play-section failed', err);
      alert('Erreur lecture section. Vérifie le backend.');
    }
  };

  // Control click handler
  const handleControlClick = (type, value = null) => {
    if (type === 'main') {
      handleChangeMain(value);
      return;
    }
    if (type === 'play') {
      togglePlay();
      return;
    }
    setControls((prev) => {
      const updated = { ...prev };
      if (type === 'acmp' || type === 'autofill') {
        updated[type] = !prev[type];
      } else if (type === 'intro') {
        const name = introName(value);
        if (!isSectionAvailable(name)) return prev;
        updated.intro = prev.intro === value ? '' : value;
        updated.ending = '';
      } else if (type === 'ending') {
        const name = endingName(value);
        if (!isSectionAvailable(name)) return prev;
        updated.ending = prev.ending === value ? '' : value;
        updated.intro = '';
      }
      return updated;
    });
  };

  // Helpers for rendering
  const currentPageBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leftColumn = currentPageBeats.slice(0, 10);
  const rightColumn = currentPageBeats.slice(10, 20);

  const renderBeatCard = (beat) => (
    <div
      key={beat.id}
      onClick={() => handleSelectBeat(beat)}
      className={`flex items-center gap-3 cursor-pointer p-2 mb-2 rounded-md transition hover:bg-blue-700 $$
        selectedBeat?.id === beat.id ? 'bg-blue-800' : 'bg-[#3a3a3a]'}`}
      title={`Tempo: ${beat.tempo} BPM, Signature: ${beat.signature}`}
    >
      <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm">
        <img src={getIconPath(beat.title)} alt="icon" className="w-8 h-8 object-contain" />
      </div>
      <div>
        <p className="font-semibold">{beat.title}</p>
        <p className="text-sm text-gray-400">
          {beat.signature} - {beat.tempo} BPM
        </p>
      </div>
    </div>
  );
  
  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6 select-none">
      {/* ... */}
    </div>
  );
}
