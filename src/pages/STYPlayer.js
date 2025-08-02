// STYPlayer.js
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';
import STYPlayerFull from './STYPlayerFull';
import STYPlayerSM from './STYPlayerSM';

export default function STYPlayer() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      if (width < 768) setIsMobile(true); // Détection mobile
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return isMobile ? <STYPlayerSM /> : <STYPlayerFull />;
}
