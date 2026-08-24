class ShopCategory {
  final String name;
  final String label;
  final String icon;
  final int order;

  const ShopCategory({
    required this.name,
    required this.label,
    this.icon = '📦',
    this.order = 99,
  });

  factory ShopCategory.fromMap(String id, Map<String, dynamic> map) {
    return ShopCategory(
      name: id,
      label: map['label'] as String? ?? map['name'] as String? ?? id,
      icon: map['icon'] as String? ?? '📦',
      order: map['order'] as int? ?? 99,
    );
  }
}

/// Matches scripts/seed.js — used when Firestore categories are unavailable.
const demoCategories = [
  ShopCategory(name: 'bread',    label: 'Bread & Bakery', icon: '🍞', order: 1),
  ShopCategory(name: 'dairy',    label: 'Dairy & Eggs',   icon: '🥛', order: 2),
  ShopCategory(name: 'meat',     label: 'Meat & Fish',    icon: '🥩', order: 3),
  ShopCategory(name: 'produce',  label: 'Fruit & Veg',    icon: '🥦', order: 4),
  ShopCategory(name: 'snacks',   label: 'Snacks',         icon: '🍿', order: 5),
  ShopCategory(name: 'drinks',   label: 'Beverages',      icon: '🥤', order: 6),
  ShopCategory(name: 'cleaning', label: 'Cleaning',       icon: '🧹', order: 7),
  ShopCategory(name: 'pool',     label: 'Pool & Garden',  icon: '🏊', order: 8),
];
