require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const Agency = require('./models/Agency');
const Item = require('./models/Item');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is missing');
  process.exit(1);
}

const seedData = [
  {
    agency: { name: 'Uttam Ghee', category: 'Dairy & ghee', colorHex: '#FCEBC9', iconKey: 'ghee' },
    items: [
      { name: 'Uttam Ghee — 1 Litre Tin', unitsPerBox: 12, boxesInStock: 40, pricePerBox: 6480, lastRestocked: '2026-08-28' },
      { name: 'Uttam Ghee — 500 g Pouch', unitsPerBox: 24, boxesInStock: 55, pricePerBox: 6720, lastRestocked: '2026-08-30' },
      { name: 'Uttam Ghee — 15 kg Tin (Bulk)', unitsPerBox: 1, boxesInStock: 8, pricePerBox: 7950, lastRestocked: '2026-08-12' },
      { name: 'Uttam Ghee — 200 ml Jar', unitsPerBox: 48, boxesInStock: 25, pricePerBox: 5760, lastRestocked: '2026-08-25' },
      { name: 'Uttam Ghee — 5 Litre Tin', unitsPerBox: 4, boxesInStock: 0, pricePerBox: 10400, lastRestocked: '2026-08-18' }
    ]
  },
  {
    agency: { name: 'Goldiee Masala', category: 'Spices', colorHex: '#F7DCC9', iconKey: 'masala' },
    items: [
      { name: 'Turmeric Powder — 500 g Pack', unitsPerBox: 20, boxesInStock: 22, pricePerBox: 2400, lastRestocked: '2026-08-29' },
      { name: 'Red Chilli Powder — 500 g Pack', unitsPerBox: 20, boxesInStock: 19, pricePerBox: 3200, lastRestocked: '2026-08-29' },
      { name: 'Coriander Powder — 500 g Pack', unitsPerBox: 20, boxesInStock: 24, pricePerBox: 2600, lastRestocked: '2026-08-27' },
      { name: 'Garam Masala — 100 g Pack', unitsPerBox: 40, boxesInStock: 6, pricePerBox: 2800, lastRestocked: '2026-08-20' },
      { name: 'Chana Masala — 100 g Pack', unitsPerBox: 40, boxesInStock: 25, pricePerBox: 2600, lastRestocked: '2026-08-22' }
    ]
  },
  {
    agency: { name: 'Tikks Sauce & Cream', category: 'Sauces & cream', colorHex: '#E4E9D9', iconKey: 'sauce' },
    items: [
      { name: 'Tomato Ketchup — 1 kg Bottle', unitsPerBox: 12, boxesInStock: 16, pricePerBox: 1320, lastRestocked: '2026-08-31' },
      { name: 'Tomato Ketchup — 500 g Bottle', unitsPerBox: 24, boxesInStock: 20, pricePerBox: 1440, lastRestocked: '2026-08-31' },
      { name: 'Mayonnaise — 500 g Jar', unitsPerBox: 24, boxesInStock: 9, pricePerBox: 2160, lastRestocked: '2026-08-26' },
      { name: 'Fresh Cream — 200 ml Pack', unitsPerBox: 36, boxesInStock: 14, pricePerBox: 2340, lastRestocked: '2026-09-01' },
      { name: 'Chilli Sauce — 700 g Bottle', unitsPerBox: 12, boxesInStock: 8, pricePerBox: 960, lastRestocked: '2026-08-24' },
      { name: 'Soya Sauce — 200 ml Bottle', unitsPerBox: 36, boxesInStock: 7, pricePerBox: 1440, lastRestocked: '2026-08-23' }
    ]
  },
  {
    agency: { name: 'Fortune Cooking Oil', category: 'Cooking Oil & Mustard Oil', colorHex: '#FEEFC3', iconKey: 'oil' },
    items: [
      { name: 'Fortune Refined Soyabean Oil — 1 L Pouch', unitsPerBox: 12, boxesInStock: 45, pricePerBox: 1680, lastRestocked: '2026-08-30' },
      { name: 'Fortune Kachi Ghani Mustard Oil — 1 L Bottle', unitsPerBox: 12, boxesInStock: 38, pricePerBox: 1920, lastRestocked: '2026-08-28' },
      { name: 'Fortune Sunlite Sunflower Oil — 1 L Pouch', unitsPerBox: 12, boxesInStock: 30, pricePerBox: 1800, lastRestocked: '2026-08-25' },
      { name: 'Fortune Soyabean Oil — 15 L Tin (Bulk)', unitsPerBox: 1, boxesInStock: 15, pricePerBox: 2150, lastRestocked: '2026-08-22' }
    ]
  },
  {
    agency: { name: 'Wagh Bakri & Taj Tea', category: 'Tea & Chai Patti', colorHex: '#EAE0D5', iconKey: 'tea' },
    items: [
      { name: 'Wagh Bakri Premium Leaf Tea — 500 g Pack', unitsPerBox: 24, boxesInStock: 35, pricePerBox: 6240, lastRestocked: '2026-08-29' },
      { name: 'Wagh Bakri Premium Leaf Tea — 250 g Pack', unitsPerBox: 48, boxesInStock: 40, pricePerBox: 6480, lastRestocked: '2026-08-29' },
      { name: 'Taj Mahal Classic Tea — 500 g Box', unitsPerBox: 20, boxesInStock: 25, pricePerBox: 7200, lastRestocked: '2026-08-27' },
      { name: 'Red Label Strong Tea — 1 kg Pack', unitsPerBox: 12, boxesInStock: 28, pricePerBox: 5520, lastRestocked: '2026-08-26' }
    ]
  },
  {
    agency: { name: 'Aashirvaad Atta', category: 'Atta, Flour & Grains', colorHex: '#F7E7CE', iconKey: 'flour' },
    items: [
      { name: 'Aashirvaad Shudh Chakki Atta — 10 kg Bag', unitsPerBox: 4, boxesInStock: 50, pricePerBox: 1880, packagingType: 'bag', lastRestocked: '2026-09-01' },
      { name: 'Aashirvaad Shudh Chakki Atta — 5 kg Bag', unitsPerBox: 6, boxesInStock: 60, pricePerBox: 1470, packagingType: 'bag', lastRestocked: '2026-09-01' },
      { name: 'Aashirvaad Select Sharbati Atta — 5 kg Bag', unitsPerBox: 6, boxesInStock: 30, pricePerBox: 1740, packagingType: 'bag', lastRestocked: '2026-08-28' },
      { name: 'Aashirvaad Multigrain Atta — 5 kg Bag', unitsPerBox: 6, boxesInStock: 22, pricePerBox: 1980, packagingType: 'bag', lastRestocked: '2026-08-26' }
    ]
  },
  {
    agency: { name: 'India Gate Basmati', category: 'Rice & Grains', colorHex: '#EBF4DD', iconKey: 'rice' },
    items: [
      { name: 'India Gate Basmati Rice Classic — 5 kg Bag', unitsPerBox: 4, boxesInStock: 32, pricePerBox: 3960, packagingType: 'bag', lastRestocked: '2026-08-29' },
      { name: 'India Gate Basmati Rice Feast Rozzana — 5 kg Bag', unitsPerBox: 4, boxesInStock: 45, pricePerBox: 2160, packagingType: 'bag', lastRestocked: '2026-08-29' },
      { name: 'India Gate Dubar Basmati Rice — 10 kg Bag', unitsPerBox: 2, boxesInStock: 20, pricePerBox: 2480, packagingType: 'bag', lastRestocked: '2026-08-25' }
    ]
  },
  {
    agency: { name: 'Tata Sampann Pulses', category: 'Dals & Pulses', colorHex: '#FFE6CC', iconKey: 'pulses' },
    items: [
      { name: 'Tata Sampann Unpolished Toor Dal — 1 kg Pack', unitsPerBox: 20, boxesInStock: 30, pricePerBox: 3600, lastRestocked: '2026-08-30' },
      { name: 'Tata Sampann Unpolished Moong Dal — 1 kg Pack', unitsPerBox: 20, boxesInStock: 28, pricePerBox: 2800, lastRestocked: '2026-08-28' },
      { name: 'Tata Sampann Chana Dal — 1 kg Pack', unitsPerBox: 20, boxesInStock: 35, pricePerBox: 2300, lastRestocked: '2026-08-28' },
      { name: 'Tata Sampann Urad White Dal — 1 kg Pack', unitsPerBox: 20, boxesInStock: 25, pricePerBox: 3100, lastRestocked: '2026-08-27' }
    ]
  },
  {
    agency: { name: 'Britannia & Parle', category: 'Biscuits & Bakery', colorHex: '#FDDBC8', iconKey: 'biscuit' },
    items: [
      { name: 'Parle-G Gold Biscuits — Box of 24 Packs', unitsPerBox: 24, boxesInStock: 50, pricePerBox: 600, lastRestocked: '2026-08-31' },
      { name: 'Britannia Good Day Butter — Box of 30 Packs', unitsPerBox: 30, boxesInStock: 42, pricePerBox: 1050, lastRestocked: '2026-08-30' },
      { name: 'Britannia Marie Gold — Box of 20 Packs', unitsPerBox: 20, boxesInStock: 38, pricePerBox: 760, lastRestocked: '2026-08-29' }
    ]
  },
  {
    agency: { name: 'Maggi & Instant Noodles', category: 'Noodles & Quick Meals', colorHex: '#FFF2B2', iconKey: 'noodle' },
    items: [
      { name: 'Maggi 2-Minute Masala Noodles — Pack of 24', unitsPerBox: 24, boxesInStock: 60, pricePerBox: 336, lastRestocked: '2026-09-01' },
      { name: 'Maggi 2-Minute Noodles Family Pack — 12 Boxes', unitsPerBox: 12, boxesInStock: 45, pricePerBox: 960, lastRestocked: '2026-08-29' },
      { name: 'Yippee Magic Masala Noodles — Pack of 24', unitsPerBox: 24, boxesInStock: 35, pricePerBox: 312, lastRestocked: '2026-08-28' },
      { name: 'Top Ramen Curry Noodles — Box of 24', unitsPerBox: 24, boxesInStock: 25, pricePerBox: 360, lastRestocked: '2026-08-26' }
    ]
  },
  {
    agency: { name: 'Bonn & Britannia Rusk', category: 'Rusk, Toast & Bakery', colorHex: '#F5DEB3', iconKey: 'rusk' },
    items: [
      { name: 'Bonn Premium Suji Rusk — Box of 24 Packs', unitsPerBox: 24, boxesInStock: 40, pricePerBox: 960, lastRestocked: '2026-08-30' },
      { name: 'Britannia Toastea Premium Rusk — Box of 20', unitsPerBox: 20, boxesInStock: 35, pricePerBox: 800, lastRestocked: '2026-08-29' },
      { name: 'Bonn Elaichi Rusk — Box of 24 Packs', unitsPerBox: 24, boxesInStock: 30, pricePerBox: 1080, lastRestocked: '2026-08-27' }
    ]
  },
  {
    agency: { name: 'Philips & Havells Lighting', category: 'Bulbs & Electricals', colorHex: '#FFF8DC', iconKey: 'bulb' },
    items: [
      { name: 'Philips 9W LED Cool Day Bulb — Box of 10', unitsPerBox: 10, boxesInStock: 30, pricePerBox: 850, lastRestocked: '2026-08-29' },
      { name: 'Philips 12W Inverter Emergency LED Bulb — Box of 6', unitsPerBox: 6, boxesInStock: 18, pricePerBox: 2340, lastRestocked: '2026-08-25' },
      { name: 'Havells 9W B22 LED Bulb — Box of 10', unitsPerBox: 10, boxesInStock: 25, pricePerBox: 790, lastRestocked: '2026-08-28' },
      { name: 'Eveready 0.5W Night Deco Bulb — Box of 20', unitsPerBox: 20, boxesInStock: 40, pricePerBox: 700, lastRestocked: '2026-08-22' }
    ]
  }
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected. Clearing existing data...');

  await Item.deleteMany({});
  await Agency.deleteMany({});

  for (const block of seedData) {
    const agencyDoc = await Agency.create(block.agency);
    const itemsWithAgency = block.items.map((i) => ({ ...i, agency: agencyDoc._id }));
    await Item.insertMany(itemsWithAgency);
    console.log(`Seeded ${block.items.length} items for ${agencyDoc.name}`);
  }

  console.log('Seed complete.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
