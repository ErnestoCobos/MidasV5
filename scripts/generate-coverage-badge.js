#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Leer el resumen de cobertura
const coverageSummaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
const badgePath = path.join(process.cwd(), '.github', 'badges', 'coverage.svg');

// Asegurarnos de que el directorio de badges existe
const badgesDir = path.dirname(badgePath);
if (!fs.existsSync(badgesDir)) {
  fs.mkdirSync(badgesDir, { recursive: true });
}

try {
  const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
  
  // Obtener el porcentaje de cobertura de líneas
  const coverage = coverageSummary.total.lines.pct;
  
  // Determinar el color basado en el porcentaje
  let color = '#e05d44'; // rojo
  if (coverage >= 90) {
    color = '#4c1'; // verde
  } else if (coverage >= 80) {
    color = '#97CA00'; // verde amarillento
  } else if (coverage >= 70) {
    color = '#dfb317'; // amarillo
  } else if (coverage >= 50) {
    color = '#fe7d37'; // naranja
  }
  
  // Generar SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="106" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="106" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <path fill="#555" d="M0 0h62v20H0z"/>
    <path fill="${color}" d="M62 0h44v20H62z"/>
    <path fill="url(#b)" d="M0 0h106v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="31" y="15" fill="#010101" fill-opacity=".3">coverage</text>
    <text x="31" y="14">coverage</text>
    <text x="84" y="15" fill="#010101" fill-opacity=".3">${coverage}%</text>
    <text x="84" y="14">${coverage}%</text>
  </g>
</svg>`;
  
  // Escribir el archivo SVG
  fs.writeFileSync(badgePath, svg);
  console.log(`Badge generado en ${badgePath}`);
  
} catch (error) {
  console.error('Error al generar el badge de cobertura:', error);
  
  // Generar un badge por defecto si hay error
  const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="106" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="106" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <path fill="#555" d="M0 0h62v20H0z"/>
    <path fill="#e05d44" d="M62 0h44v20H62z"/>
    <path fill="url(#b)" d="M0 0h106v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="31" y="15" fill="#010101" fill-opacity=".3">coverage</text>
    <text x="31" y="14">coverage</text>
    <text x="84" y="15" fill="#010101" fill-opacity=".3">0.92%</text>
    <text x="84" y="14">0.92%</text>
  </g>
</svg>`;
  
  fs.writeFileSync(badgePath, defaultSvg);
  console.log(`Badge por defecto generado en ${badgePath}`);
}
