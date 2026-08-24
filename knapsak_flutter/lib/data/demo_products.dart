import '../models/product.dart';

/// Static demo data — mirrors HomeScreen.js in the React Native app.
final List<Product> demoProducts = [
  const Product(
    id: '1',
    name: 'Blue Ribbon Toaster White Bread 700g',
    price: 18.99,
    delivery: 'Wed 8-9 AM',
    category: 'bread',
  ),
  const Product(
    id: '2',
    name: 'Albany Superior Brown Bread 700g',
    price: 19.99,
    delivery: 'Wed 8-9 AM',
    category: 'bread',
  ),
  const Product(
    id: '3',
    name: 'The Bakery Brown Bread 700g',
    price: 15.99,
    delivery: 'Wed 8-9 AM',
    category: 'bread',
  ),
  const Product(
    id: '4',
    name: 'The Bakery White Bread 700g',
    price: 16.99,
    delivery: 'Wed 8-9 AM',
    category: 'bread',
  ),
  const Product(
    id: '5',
    name: 'Blue Ribbon Toaster White Bread 700g',
    price: 20.99,
    delivery: 'Wed 8-9 AM',
    category: 'bread',
  ),
  const Product(
    id: '6',
    name: 'Sasko Brown Bread Premium 700g',
    price: 16.99,
    delivery: 'Wed 8-9 AM',
    category: 'bread',
  ),
];

final Product demoSpecialProduct = const Product(
  id: 'special-1',
  name: 'Kreepy Krauly Tiger Shark Pro Automatic Pool Cleaner Combi Pack',
  price: 2599.99,
  originalPrice: 3299.99,
  savings: 700,
  delivery: 'Wed 10-11 AM',
  category: 'pool',
  isSpecial: true,
);
