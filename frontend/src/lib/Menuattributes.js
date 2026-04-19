/**
 * menuAttributes.js
 * Single source of truth for all menu item attribute options.
 */
import {
  SunHorizonIcon,
  SunIcon,
  MoonIcon,
  PopcornIcon,
  BrandyIcon,
  BowlSteamIcon,
  CookingPotIcon,
  ForkKnifeIcon,
  SparkleIcon,
  LeafIcon,
  PlantIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  CrownIcon,
  SmileyIcon,
  PepperIcon,
  FireIcon,
  HeartIcon,
  CircleIcon,
  WarningCircleIcon,
  ChefHatIcon,
  StarIcon,
  TrendUpIcon,
  CoffeeIcon,
  EggIcon
} from 'phosphor-svelte';

// ── Meal Type ─────────────────────────────────────────────
export const MEAL_TYPES = [
  { value: 'Breakfast', label: 'Breakfast', icon: SunHorizonIcon, slot: [6, 10] },
  { value: 'Lunch',     label: 'Lunch',     icon: SunIcon,     slot: [10, 15] },
  { value: 'Dinner',    label: 'Dinner',    icon: MoonIcon,    slot: [18, 23] },
  { value: 'Snack',     label: 'Snack',     icon: PopcornIcon, slot: [15, 18] },
  { value: 'Drink',     label: 'Drink',     icon: CoffeeIcon,     slot: [0, 24] },
];

// ── Cuisine Type ──────────────────────────────────────────
export const CUISINE_TYPES = [
  { value: 'Nepali',      label: 'Nepali',      icon: BowlSteamIcon },
  { value: 'Indian',      label: 'Indian',      icon: CookingPotIcon },
  { value: 'Chinese',     label: 'Chinese',     icon: ForkKnifeIcon },
  { value: 'Continental', label: 'Continental', icon: ForkKnifeIcon },
  { value: 'Other',       label: 'Other',       icon: SparkleIcon },
];

// ── Diet Type ─────────────────────────────────────────────
export const DIET_TYPES = [
  { value: 'Veg',     label: 'Vegetarian', icon: LeafIcon,      color: '#16a34a' },
  { value: 'Non-Veg', label: 'Non-Veg',    icon: EggIcon, color: '#dc2626' },
  { value: 'Vegan',   label: 'Vegan',      icon: PlantIcon,     color: '#15803d' },
];

// ── Price Tier ────────────────────────────────────────────
export const PRICE_TIERS = [
  { value: 'Budget',   label: 'Budget',   icon: CurrencyDollarIcon, range: 'Under Rs 150' },
  { value: 'Standard', label: 'Standard', icon: CreditCardIcon,     range: 'Rs 150–350' },
  { value: 'Premium',  label: 'Premium',  icon: CrownIcon,          range: 'Above Rs 350' },
];

export function derivePriceTier(price) {
  if (!price || price < 150) return 'Budget';
  if (price <= 350) return 'Standard';
  return 'Premium';
}

// ── Spice Level ───────────────────────────────────────────
export const SPICE_LEVELS = [
  { value: 'Mild',   label: 'Mild',   icon: SmileyIcon, color: '#84cc16' },
  { value: 'Medium', label: 'Medium', icon: PepperIcon, color: '#f97316' },
  { value: 'Spicy',  label: 'Spicy',  icon: FireIcon,   color: '#dc2626' },
];

// ── Health Tag ────────────────────────────────────────────
export const HEALTH_TAGS = [
  { value: 'Healthy', label: 'Healthy', icon: HeartIcon,         score: 5 },
  { value: 'Regular', label: 'Regular', icon: CircleIcon,        score: 3 },
  { value: 'Fried',   label: 'Fried',   icon: WarningCircleIcon, score: 1 },
];

// ── Popularity Tag ────────────────────────────────────────
export const POPULARITY_TAGS = [
  { value: '',             label: 'None',         icon: null },
  { value: 'Chef Special', label: 'Chef Special', icon: ChefHatIcon },
  { value: 'Bestseller',   label: 'Bestseller',   icon: StarIcon },
  { value: 'Trending',     label: 'Trending',     icon: TrendUpIcon },
];

// ── Recommendation Weights ────────────────────────────────
export const AXIS_WEIGHTS = {
  mealType:    0.25,
  cuisineType: 0.25,
  dietType:    0.20,
  priceTier:   0.20,
  spiceLevel:  0.10,
};

export const HEALTH_SCORE_MAP = {
  Healthy: 5,
  Regular: 3,
  Fried: 1,
};

export const POPULARITY_BOOST = {
  Bestseller: 0.15,
  Trending: 0.10,
  'Chef Special': 0.05,
  '': 0,
};