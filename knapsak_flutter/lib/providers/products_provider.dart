import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../data/demo_products.dart';
import '../models/product.dart';
import '../models/shop_category.dart';
import '../services/firebase/firestore_service.dart';

// Dart equivalent of productsSlice.js
class ProductsProvider extends ChangeNotifier {
  final FirestoreService _firestore = FirestoreService();

  List<Product> _products = [];
  List<Product> _featuredProducts = [];
  List<Product> _searchResults = [];
  List<ShopCategory> _shopCategories = [];
  Product? _selectedProduct;
  Product? _foodOfTheDay;

  bool _isLoading = false;
  bool _isSearching = false;
  String? _errorMessage;
  String? _searchError;
  String? _selectedCategory;
  String? _selectedDelivery;
  StreamSubscription<List<Product>>? _productsSubscription;

  // Getters
  List<Product> get products => _products;
  List<Product> get featuredProducts => _featuredProducts;
  List<Product> get searchResults => _searchResults;
  List<ShopCategory> get shopCategories =>
      _shopCategories.isNotEmpty ? _shopCategories : demoCategories;
  /// Legacy — category id strings only.
  List<String> get categories =>
      shopCategories.map((c) => c.name).toList();
  Product? get selectedProduct => _selectedProduct;
  Product? get foodOfTheDay => _foodOfTheDay;
  bool get isLoading => _isLoading;
  bool get isSearching => _isSearching;
  String? get errorMessage => _errorMessage;
  String? get searchError => _searchError;
  String? get selectedCategory => _selectedCategory;
  String? get selectedDelivery => _selectedDelivery;
  bool get hasActiveFilter =>
      _selectedCategory != null || _selectedDelivery != null;

  /// Firestore products when available, otherwise static demo catalog.
  List<Product> get catalogProducts =>
      _products.isNotEmpty ? _products : demoProducts;

  /// Featured/special product for the home banner — demo fallback when empty.
  Product get catalogSpecialProduct => _featuredProducts.isNotEmpty
      ? _featuredProducts.first
      : demoSpecialProduct;

  /// Grid products exclude specials (shown in the banner section instead).
  List<Product> get catalogGridProducts =>
      catalogProducts.where((p) => !p.isSpecial).toList();

  /// Unique delivery slots from the active catalog, sorted.
  List<String> get deliverySlots {
    final slots = catalogProducts
        .map((p) => p.delivery)
        .where((d) => d.isNotEmpty)
        .toSet()
        .toList();
    slots.sort();
    return slots;
  }

  /// Products after category / delivery filters (before search).
  List<Product> get filteredGridProducts {
    var list = catalogGridProducts;
    if (_selectedCategory != null) {
      list = list.where((p) => p.category == _selectedCategory).toList();
    }
    if (_selectedDelivery != null) {
      list = list.where((p) => p.delivery == _selectedDelivery).toList();
    }
    return list;
  }

  /// Client-side search over filtered catalog grid.
  List<Product> searchCatalog(String query) {
    final source = filteredGridProducts;
    if (query.trim().isEmpty) return source;
    final lower = query.toLowerCase();
    return source
        .where((p) => p.name.toLowerCase().contains(lower))
        .toList();
  }

  // ── Fetch all products ────────────────────────────────────────────────────

  Future<void> fetchProducts({String? category}) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _products = await _firestore.getProducts(category: category);
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load products.';
    } catch (e) {
      _errorMessage = 'An unexpected error occurred.';
    }

    _isLoading = false;
    notifyListeners();
  }

  // ── Fetch featured / specials ─────────────────────────────────────────────

  Future<void> fetchFeaturedProducts() async {
    try {
      _featuredProducts = await _firestore.getFeaturedProducts();
      notifyListeners();
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load featured products.';
      notifyListeners();
    }
  }

  // ── Fetch categories ──────────────────────────────────────────────────────

  Future<void> fetchCategories() async {
    try {
      _shopCategories = await _firestore.getShopCategories();
      notifyListeners();
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load categories.';
      notifyListeners();
    }
  }

  // ── Fetch food / deal of the day ──────────────────────────────────────────

  Future<void> fetchFoodOfTheDay() async {
    try {
      _foodOfTheDay = await _firestore.getFoodOfTheDay();
      notifyListeners();
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load deal of the day.';
      notifyListeners();
    }
  }

  // ── Fetch single product ──────────────────────────────────────────────────

  Future<void> fetchProductById(String productId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _selectedProduct = await _firestore.getProductById(productId);
      if (_selectedProduct == null) {
        _errorMessage = 'Product not found.';
      }
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load product.';
    }

    _isLoading = false;
    notifyListeners();
  }

  // ── Search ────────────────────────────────────────────────────────────────

  Future<void> searchProducts(String query) async {
    if (query.trim().isEmpty) {
      _searchResults = [];
      _searchError = null;
      notifyListeners();
      return;
    }

    _isSearching = true;
    _searchError = null;
    notifyListeners();

    try {
      // Firestore doesn't support full-text search natively.
      // This does a prefix match on the name field.
      // For production, swap this with Algolia or Typesense.
      _searchResults =
          await _firestore.searchProductsByNamePrefix(query);
    } on FirebaseException catch (e) {
      _searchError = e.message ?? 'Search failed.';
    }

    _isSearching = false;
    notifyListeners();
  }

  // ── Local search (for offline/demo use) ──────────────────────────────────

  List<Product> localSearch(String query) {
    if (query.trim().isEmpty) return _products;
    final lower = query.toLowerCase();
    return _products
        .where((p) => p.name.toLowerCase().contains(lower))
        .toList();
  }

  // ── Category / delivery filters ───────────────────────────────────────────

  void selectCategory(String? category) {
    _selectedCategory = category;
    notifyListeners();
  }

  void selectDelivery(String? delivery) {
    _selectedDelivery = delivery;
    notifyListeners();
  }

  void clearFilters() {
    _selectedCategory = null;
    _selectedDelivery = null;
    notifyListeners();
  }

  // ── Real-time listener (optional — replaces polling) ──────────────────────

  void listenToProducts({String? category}) {
    stopListeningToProducts();

    _productsSubscription =
        _firestore.streamProducts(category: category).listen((products) {
      _products = products;
      _isLoading = false;
      notifyListeners();
    }, onError: (_) {
      _errorMessage = 'Live update failed.';
      notifyListeners();
    });
  }

  void stopListeningToProducts() {
    _productsSubscription?.cancel();
    _productsSubscription = null;
  }

  @override
  void dispose() {
    stopListeningToProducts();
    super.dispose();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void clearError() {
    _errorMessage = null;
    _searchError = null;
    notifyListeners();
  }

  void clearSearchResults() {
    _searchResults = [];
    _searchError = null;
    notifyListeners();
  }

  void setSelectedProduct(Product? product) {
    _selectedProduct = product;
    notifyListeners();
  }
}
