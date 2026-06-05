import React from 'react';

interface SushiLogoProps {
  className?: string;
  size?: number | string;
}

export default function SushiLogo({ className = '', size = 48 }: SushiLogoProps) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 500 500" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Circle Emblem Background (Dark Charcoal) */}
      <circle cx="250" cy="250" r="235" fill="#2d3135" />
      
      {/* Red Sun Circle */}
      <circle cx="270" cy="190" r="95" fill="#e12c22" />
      
      {/* Kanji "和食" on Red Sun */}
      <text 
        x="270" 
        y="170" 
        fill="#2d3135" 
        fontSize="36" 
        fontWeight="bold" 
        fontFamily="'MS Gothic', sans-serif" 
        textAnchor="middle"
      >
        和
      </text>
      <text 
        x="270" 
        y="212" 
        fill="#2d3135" 
        fontSize="36" 
        fontWeight="bold" 
        fontFamily="'MS Gothic', sans-serif" 
        textAnchor="middle"
      >
        食
      </text>

      {/* Elegant Diagonal Chopsticks with red bands */}
      <g>
        {/* Bottom Hashi */}
        <path d="M 265,210 L 415,250" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
        <path d="M 370,238 L 415,250" stroke="#e12c22" strokeWidth="8" strokeLinecap="round" />
        {/* Top Hashi */}
        <path d="M 280,192 L 418,228" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
        <path d="M 375,217 L 418,228" stroke="#e12c22" strokeWidth="8" strokeLinecap="round" />
      </g>

      {/* Stylized White Dragon Head Silhouette */}
      <path 
        d="M 120,192 
           C 140,165 170,148 198,158 
           C 202,142 225,132 240,142
           C 255,152 242,175 260,180
           C 280,185 300,168 318,195
           C 322,200 310,215 292,208
           C 278,215 272,192 258,202
           C 260,212 268,218 262,224
           C 250,228 238,212 228,215
           C 232,225 234,232 225,240
           C 215,242 205,228 195,235
           C 185,242 190,252 180,258
           C 168,260 162,242 152,238
           C 142,232 148,218 138,212
           C 128,208 132,222 122,225
           C 112,228 108,218 98,212
           C 88,208 98,195 120,192 Z" 
        fill="#ffffff" 
      />
      
      {/* Decorative details for dragon horns/whiskers */}
      <path d="M 170,158 Q 148,138 128,152" stroke="#ffffff" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M 185,152 Q 162,128 142,142" stroke="#ffffff" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M 120,208 Q 140,218 150,228" stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M 130,222 Q 155,242 170,248" stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round" />

      {/* Styled text "LAGUNA" */}
      <g>
        {/* L */}
        <path d="M 100,318 L 100,358 L 140,358 L 140,350 L 115,350 Q 120,342 125,338" stroke="#ffffff" strokeWidth="12" strokeLinecap="square" fill="none" />
        {/* A */}
        <path d="M 155,358 L 175,318 L 195,358 M 165,342 L 185,342" stroke="#ffffff" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
        {/* G */}
        <path d="M 250,330 C 240,318 215,318 215,338 C 215,358 240,358 250,346 L 250,356" stroke="#ffffff" strokeWidth="12" strokeLinecap="square" fill="none" />
        {/* U */}
        <path d="M 270,318 L 270,346 Q 270,358 288,358 Q 306,358 306,346 L 306,318" stroke="#ffffff" strokeWidth="11" strokeLinecap="square" fill="none" />
        {/* N */}
        <path d="M 325,358 L 325,318 L 355,358 L 355,318" stroke="#ffffff" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
        {/* A */}
        <path d="M 375,358 L 395,318 L 415,358 M 385,342 L 405,342" stroke="#ffffff" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
      </g>

      {/* "SUSHI DELIVERY" text with high-visibility spacing */}
      <text 
        x="250" 
        y="410" 
        fill="#e12c22" 
        fontSize="35" 
        fontWeight="900" 
        fontFamily="'Impact', 'Arial Black', sans-serif" 
        letterSpacing="3.5" 
        textAnchor="middle"
      >
        SUSHI DELIVERY
      </text>
    </svg>
  );
}
