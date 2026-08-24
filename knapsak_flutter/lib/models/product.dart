class Product {
  final String id;
  final String name;
  final double price;
  final String? imageUrl;
  final String category;
  final String delivery;
  final bool isSpecial;
  final double? originalPrice;
  final double? savings;

  const Product({
    required this.id,
    required this.name,
    required this.price,
    this.imageUrl,
    required this.category,
    required this.delivery,
    this.isSpecial = false,
    this.originalPrice,
    this.savings,
  });

  factory Product.fromMap(Map<String, dynamic> map) {
    return Product(
      id: map['id'] as String,
      name: map['name'] as String,
      price: (map['price'] as num).toDouble(),
      imageUrl: map['imageUrl'] as String?,
      category: map['category'] as String? ?? 'general',
      delivery: map['delivery'] as String? ?? '',
      isSpecial: map['isSpecial'] as bool? ?? false,
      originalPrice: (map['originalPrice'] as num?)?.toDouble(),
      savings: (map['savings'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'price': price,
      'imageUrl': imageUrl,
      'category': category,
      'delivery': delivery,
      'isSpecial': isSpecial,
      'originalPrice': originalPrice,
      'savings': savings,
    };
  }
}
