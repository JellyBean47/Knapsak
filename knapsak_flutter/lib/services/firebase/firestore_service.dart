import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:firebase_auth/firebase_auth.dart';

import '../../models/address.dart';
import '../../models/cart_item.dart';
import '../../models/order.dart';
import '../../models/product.dart';
import '../../models/shop_category.dart';

class FirestoreService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // ── Products ──────────────────────────────────────────────────────────────

  Future<List<Product>> getProducts({String? category}) async {
    Query<Map<String, dynamic>> query =
        _db.collection('products').orderBy('name');

    if (category != null && category != 'all') {
      query = query.where('category', isEqualTo: category);
    }

    final snapshot = await query.get();
    return snapshot.docs
        .map((doc) => Product.fromMap({...doc.data(), 'id': doc.id}))
        .toList();
  }

  Future<List<Product>> getFeaturedProducts() async {
    final snapshot = await _db
        .collection('products')
        .where('isSpecial', isEqualTo: true)
        .get();
    return snapshot.docs
        .map((doc) => Product.fromMap({...doc.data(), 'id': doc.id}))
        .toList();
  }

  Future<Product?> getProductById(String id) async {
    final doc = await _db.collection('products').doc(id).get();
    if (!doc.exists) return null;
    return Product.fromMap({...doc.data()!, 'id': doc.id});
  }

  Future<List<ShopCategory>> getShopCategories() async {
    final snapshot =
        await _db.collection('categories').orderBy('order').get();
    return snapshot.docs
        .map((doc) => ShopCategory.fromMap(doc.id, doc.data()))
        .toList();
  }

  Future<Product?> getFoodOfTheDay() async {
    final snapshot = await _db
        .collection('products')
        .where('isFoodOfTheDay', isEqualTo: true)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) return null;
    final doc = snapshot.docs.first;
    return Product.fromMap({...doc.data(), 'id': doc.id});
  }

  Future<List<Product>> searchProductsByNamePrefix(String query) async {
    final snapshot = await _db
        .collection('products')
        .orderBy('name')
        .startAt([query])
        .endAt(['$query\uf8ff'])
        .get();
    return snapshot.docs
        .map((doc) => Product.fromMap({...doc.data(), 'id': doc.id}))
        .toList();
  }

  Stream<List<Product>> streamProducts({String? category}) {
    Query<Map<String, dynamic>> query =
        _db.collection('products').orderBy('name');
    if (category != null && category != 'all') {
      query = query.where('category', isEqualTo: category);
    }
    return query.snapshots().map((snap) => snap.docs
        .map((doc) => Product.fromMap({...doc.data(), 'id': doc.id}))
        .toList());
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  Future<String> createOrder(Map<String, dynamic> orderData) async {
    final docRef = await _db.collection('orders').add(orderData);
    return docRef.id;
  }

  Future<List<Order>> getUserOrders(String userId) async {
    final snapshot = await _db
        .collection('orders')
        .where('userId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .get();
    return snapshot.docs
        .map((doc) => orderFromDoc(doc.id, doc.data()))
        .toList();
  }

  Future<Order?> getOrderById(String orderId) async {
    final doc = await _db.collection('orders').doc(orderId).get();
    if (!doc.exists) return null;
    return orderFromDoc(doc.id, doc.data()!);
  }

  Stream<Order?> streamOrder(String orderId) {
    return _db.collection('orders').doc(orderId).snapshots().map((doc) {
      if (!doc.exists) return null;
      return orderFromDoc(doc.id, doc.data()!);
    });
  }

  Future<void> cancelOrder(
    String orderId, {
    required OrderStatus fromStatus,
  }) async {
    await _db.collection('orders').doc(orderId).update({
      'status': 'cancelled',
      'cancelledAt': FieldValue.serverTimestamp(),
      'cancelledFromStatus': fromStatus.name,
    });
  }

  Map<String, dynamic> buildOrderData({
    required String userId,
    required List<CartItem> items,
    required double totalAmount,
    required String deliveryAddress,
    String? paymentIntentId,
  }) {
    return {
      'userId': userId,
      'items': items
          .map((item) => {
                'productId': item.product.id,
                'productName': item.product.name,
                'productPrice': item.product.price,
                'quantity': item.quantity,
                'totalPrice': item.totalPrice,
              })
          .toList(),
      'totalAmount': totalAmount,
      'status': paymentIntentId != null ? 'confirmed' : 'pending',
      'paymentIntentId': paymentIntentId,
      'paymentStatus': paymentIntentId != null ? 'paid' : 'unpaid',
      'deliveryAddress': deliveryAddress,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  Order orderFromDoc(String id, Map<String, dynamic> data) {
    return Order(
      id: id,
      items: _parseItems(data['items'] as List<dynamic>?),
      totalAmount: (data['totalAmount'] as num).toDouble(),
      status: parseOrderStatus(data['status'] as String? ?? 'pending'),
      createdAt: _parseCreatedAt(data['createdAt']),
      deliveryAddress: data['deliveryAddress'] as String?,
      cancelledFromStatus: data['cancelledFromStatus'] != null
          ? parseOrderStatus(data['cancelledFromStatus'] as String)
          : null,
    );
  }

  OrderStatus parseOrderStatus(String status) {
    switch (status) {
      case 'confirmed':
        return OrderStatus.confirmed;
      case 'preparing':
        return OrderStatus.preparing;
      case 'delivering':
        return OrderStatus.delivering;
      case 'delivered':
        return OrderStatus.delivered;
      case 'cancelled':
        return OrderStatus.cancelled;
      default:
        return OrderStatus.pending;
    }
  }

  List<CartItem> _parseItems(List<dynamic>? raw) {
    if (raw == null) return [];

    return raw.map((entry) {
      final map = Map<String, dynamic>.from(entry as Map);
      return CartItem(
        product: Product(
          id: map['productId'] as String? ?? '',
          name: map['productName'] as String? ?? 'Unknown product',
          price: (map['productPrice'] as num?)?.toDouble() ?? 0,
          category: map['category'] as String? ?? '',
          delivery: map['delivery'] as String? ?? '',
        ),
        quantity: (map['quantity'] as num?)?.toInt() ?? 1,
      );
    }).toList();
  }

  DateTime _parseCreatedAt(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return DateTime.now();
  }

  // ── User profile ──────────────────────────────────────────────────────────

  Future<Map<String, dynamic>?> getUserProfile(String userId) async {
    final doc = await _db.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return doc.data();
  }

  Future<void> createUserProfile(
      String userId, Map<String, dynamic> data) async {
    await _db.collection('users').doc(userId).set(data, SetOptions(merge: true));
  }

  Future<void> updateUserProfile(
      String userId, Map<String, dynamic> data) async {
    await _db.collection('users').doc(userId).update(data);
  }

  /// Creates a profile doc for accounts that predate signup profile creation.
  Future<void> ensureUserProfile(User user) async {
    final doc = await _db.collection('users').doc(user.uid).get();
    if (doc.exists) return;

    await createUserProfile(user.uid, {
      'email': user.email ?? '',
      'displayName': user.displayName ?? user.email ?? '',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  // ── Saved addresses ───────────────────────────────────────────────────────

  Future<List<SavedAddress>> getSavedAddresses(String userId) async {
    final snapshot = await _db
        .collection('users')
        .doc(userId)
        .collection('addresses')
        .orderBy('createdAt', descending: true)
        .get();
    return snapshot.docs
        .map((doc) => SavedAddress.fromMap({...doc.data(), 'id': doc.id}))
        .toList();
  }

  Future<void> saveAddress(String userId, SavedAddress address) async {
    await _db
        .collection('users')
        .doc(userId)
        .collection('addresses')
        .doc(address.id)
        .set(address.toMap());
  }

  Future<void> deleteAddress(String userId, String addressId) async {
    await _db
        .collection('users')
        .doc(userId)
        .collection('addresses')
        .doc(addressId)
        .delete();
  }
}
