export type CharacterClass = "guerrero" | "mago" | "arquero";

const BASE: Record<CharacterClass, { health: number; attack: number; defense: number; speed: number }> = {
  guerrero: { health: 120, attack: 14, defense: 10, speed: 6 },
  mago: { health: 90, attack: 18, defense: 5, speed: 8 },
  arquero: { health: 100, attack: 15, defense: 7, speed: 12 },
};

// Cada nivel adicional aumenta un 10% las estadísticas base
export function statsFor(characterClass: CharacterClass, level = 1) {
  const base = BASE[characterClass];
  const factor = 1 + (level - 1) * 0.1;
  return {
    health: Math.round(base.health * factor),
    attack: Math.round(base.attack * factor),
    defense: Math.round(base.defense * factor),
    speed: Math.round(base.speed * factor),
  };
}
