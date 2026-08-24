import 'package:flutter/foundation.dart';
import '../models/cart_item.dart';
import '../models/product.dart';

// Dart equivalent of CartContext.js + cartSlice.js
class CartProvider extends ChangeNotifier {
  final Map<String, CartItem> _items = {};

  List<CartItem> get items => _items.values.toList();

  int get totalItems =>
      _items.values.fold(0, (sum, item) => sum + item.quantity);

  double get totalPrice =>
      _items.values.fold(0.0, (sum, item) => sum + item.totalPrice);

  static const double taxRate = 0.08;
  static const double deliveryFee = 5.99;

  double get subtotal => totalPrice;
  double get tax => subtotal * taxRate;
  double get total => subtotal + tax + deliveryFee;
  bool get isEmpty => _items.isEmpty;

  bool hasItem(String productId) => _items.containsKey(productId);

  int quantityOf(String productId) => _items[productId]?.quantity ?? 0;

  void addItem(Product product) {
    if (_items.containsKey(product.id)) {
      _items[product.id]!.quantity++;
    } else {
      _items[product.id] = CartItem(product: product);
    }
    notifyListeners();
  }

  void removeItem(String productId) {
    _items.remove(productId);
    notifyListeners();
  }

  void decrementItem(String productId) {
    if (!_items.containsKey(productId)) return;
    if (_items[productId]!.quantity <= 1) {
      _items.remove(productId);
    } else {
      _items[productId]!.quantity--;
    }
    notifyListeners();
  }

  void updateQuantity(String productId, int quantity) {
    if (quantity <= 0) {
      removeItem(productId);
    } else if (_items.containsKey(productId)) {
      _items[productId]!.quantity = quantity;
      notifyListeners();
    }
  }

  void clearCart() {
    _items.clear();
    notifyListeners();
  }
}
