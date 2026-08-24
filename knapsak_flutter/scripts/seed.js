const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: cert(require('./service-account.json')),
});

const db = getFirestore();

const categories = [
  { name: 'bread',    label: 'Bread & Bakery', icon: '🍞', order: 1 },
  { name: 'dairy',    label: 'Dairy & Eggs',   icon: '🥛', order: 2 },
  { name: 'meat',     label: 'Meat & Fish',    icon: '🥩', order: 3 },
  { name: 'produce',  label: 'Fruit & Veg',    icon: '🥦', order: 4 },
  { name: 'snacks',   label: 'Snacks',         icon: '🍿', order: 5 },
  { name: 'drinks',   label: 'Beverages',      icon: '🥤', order: 6 },
  { name: 'cleaning', label: 'Cleaning',       icon: '🧹', order: 7 },
  { name: 'pool',     label: 'Pool & Garden',  icon: '🏊', order: 8 },
];

const products = [
  {
    id: '1',
    name: 'Blue Ribbon Toaster White Bread 700g',
    price: 18.99,
    category: 'bread',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '2',
    name: 'Albany Superior Brown Bread 700g',
    price: 19.99,
    category: 'bread',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: true,
  },
  {
    id: '3',
    name: 'The Bakery Brown Bread 700g',
    price: 15.99,
    category: 'bread',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '4',
    name: 'The Bakery White Bread 700g',
    price: 16.99,
    category: 'bread',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '5',
    name: 'Blue Ribbon Low GI Bread 700g',
    price: 20.99,
    category: 'bread',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '6',
    name: 'Sasko Brown Bread Premium 700g',
    price: 16.99,
    category: 'bread',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '7',
    name: 'Clover Full Cream Milk 2L',
    price: 32.99,
    category: 'dairy',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '8',
    name: 'Parmalat Low Fat Milk 1L',
    price: 17.99,
    category: 'dairy',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '9',
    name: 'Lancewood Cheddar Cheese 400g',
    price: 64.99,
    category: 'dairy',
    delivery: 'Wed 9-10 AM',
    isSpecial: true,
    originalPrice: 79.99,
    savings: 15.00,
    isFoodOfTheDay: false,
  },
  {
    id: '10',
    name: 'Woolworths Free Range Eggs 6 Pack',
    price: 34.99,
    category: 'dairy',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '11',
    name: 'Loose Bananas per kg',
    price: 21.99,
    category: 'produce',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '12',
    name: 'Rosa Tomatoes 500g Punnet',
    price: 24.99,
    category: 'produce',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '13',
    name: 'Avocado each',
    price: 12.99,
    category: 'produce',
    delivery: 'Wed 8-9 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '14',
    name: 'Simba Chips Original 120g',
    price: 14.99,
    category: 'snacks',
    delivery: 'Wed 9-10 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '15',
    name: 'Beacon Chocolate Slab 80g',
    price: 18.99,
    category: 'snacks',
    delivery: 'Wed 9-10 AM',
    isSpecial: true,
    originalPrice: 24.99,
    savings: 6.00,
    isFoodOfTheDay: false,
  },
  {
    id: '16',
    name: 'Coca-Cola 2L',
    price: 22.99,
    category: 'drinks',
    delivery: 'Wed 9-10 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: '17',
    name: 'Oros Orange Squash 1L',
    price: 27.99,
    category: 'drinks',
    delivery: 'Wed 9-10 AM',
    isSpecial: false,
    isFoodOfTheDay: false,
  },
  {
    id: 'special-1',
    name: 'Kreepy Krauly Tiger Shark Pro Automatic Pool Cleaner Combi Pack',
    price: 2599.99,
    originalPrice: 3299.99,
    savings: 700.00,
    category: 'pool',
    delivery: 'Wed 10-11 AM',
    isSpecial: true,
    isFoodOfTheDay: false,
  },
];

async function seed() {
  console.log('🌱 Starting Firestore seed...\n');

  console.log('📂 Seeding categories...');
  const catBatch = db.batch();
  for (const cat of categories) {
    catBatch.set(db.collection('categories').doc(cat.name), cat);
  }
  await catBatch.commit();
  console.log(`   ✅ ${categories.length} categories written\n`);

  console.log('📦 Seeding products...');
  const batch = db.batch();
  for (const product of products) {
    batch.set(db.collection('products').doc(product.id), product);
  }
  await batch.commit();
  console.log(`   ✅ ${products.length} products written\n`);

  console.log('🎉 Seed complete! Your Firestore is ready.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
