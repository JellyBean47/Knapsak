import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/order.dart';
import '../models/cart_item.dart';
import '../services/firebase/firestore_service.dart';

// Dart equivalent of ordersSlice.js
class OrdersProvider extends ChangeNotifier {
  final FirestoreService _firestore = FirestoreService();
  final FirebaseAuth _auth = FirebaseAuth.instance;

  List<Order> _orders = [];
  Order? _currentOrder;
  bool _isLoading = false;
  bool _isCreating = false;
  String? _errorMessage;
  String? _createError;
  StreamSubscription<Order?>? _orderSubscription;
  String? _listeningOrderId;

  List<Order> get orders => _orders;
  Order? get currentOrder => _currentOrder;
  bool get isLoading => _isLoading;
  bool get isCreating => _isCreating;
  String? get errorMessage => _errorMessage;
  String? get createError => _createError;

  List<Order> get recentOrders => _orders.take(5).toList();

  List<Order> ordersByStatus(OrderStatus status) =>
      _orders.where((o) => o.status == status).toList();

  // ── Create order ──────────────────────────────────────────────────────────

  Future<Order?> createOrder({
    required List<CartItem> items,
    required double totalAmount,
    required String deliveryAddress,
    String? paymentIntentId,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      _createError = 'You must be logged in to place an order.';
      notifyListeners();
      return null;
    }

    _isCreating = true;
    _createError = null;
    notifyListeners();

    try {
      final orderData = _firestore.buildOrderData(
        userId: user.uid,
        items: items,
        totalAmount: totalAmount,
        deliveryAddress: deliveryAddress,
        paymentIntentId: paymentIntentId,
      );

      final orderId = await _firestore.createOrder(orderData);

      final newOrder = Order(
        id: orderId,
        items: items,
        totalAmount: totalAmount,
        status: OrderStatus.pending,
        createdAt: DateTime.now(),
        deliveryAddress: deliveryAddress,
      );

      _currentOrder = newOrder;
      _orders.insert(0, newOrder);
      _isCreating = false;
      notifyListeners();
      return newOrder;
    } on FirebaseException catch (e) {
      _createError = e.message ?? 'Failed to place order.';
      _isCreating = false;
      notifyListeners();
      return null;
    }
  }

  // ── Fetch user orders ─────────────────────────────────────────────────────

  Future<void> fetchUserOrders() async {
    final user = _auth.currentUser;
    if (user == null) return;

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _orders = await _firestore.getUserOrders(user.uid);
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load orders.';
    }

    _isLoading = false;
    notifyListeners();
  }

  // ── Fetch single order ────────────────────────────────────────────────────

  Future<void> fetchOrderById(String orderId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _currentOrder = await _firestore.getOrderById(orderId);
      if (_currentOrder == null) {
        _errorMessage = 'Order not found.';
      }
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to load order.';
    }

    _isLoading = false;
    notifyListeners();
  }

  // ── Cancel order ──────────────────────────────────────────────────────────

  Future<bool> cancelOrder(String orderId) async {
    try {
      final existing = _orders.where((o) => o.id == orderId).firstOrNull ??
          (_currentOrder?.id == orderId ? _currentOrder : null);
      final fromStatus = existing?.status ?? OrderStatus.pending;

      await _firestore.cancelOrder(orderId, fromStatus: fromStatus);

      Order asCancelled(Order o) => Order(
            id: o.id,
            items: o.items,
            totalAmount: o.totalAmount,
            status: OrderStatus.cancelled,
            createdAt: o.createdAt,
            deliveryAddress: o.deliveryAddress,
            cancelledFromStatus: fromStatus,
          );

      _orders = _orders.map((o) {
        if (o.id == orderId) return asCancelled(o);
        return o;
      }).toList();

      if (_currentOrder != null && _currentOrder!.id == orderId) {
        _currentOrder = asCancelled(_currentOrder!);
      }

      notifyListeners();
      return true;
    } on FirebaseException catch (e) {
      _errorMessage = e.message ?? 'Failed to cancel order.';
      notifyListeners();
      return false;
    }
  }

  // ── Real-time order tracking ──────────────────────────────────────────────

  void listenToOrder(String orderId) {
    if (_listeningOrderId == orderId && _orderSubscription != null) return;

    stopListeningToOrder();
    _listeningOrderId = orderId;

    _orderSubscription = _firestore.streamOrder(orderId).listen((updatedOrder) {
      if (updatedOrder == null) return;

      _currentOrder = updatedOrder;

      final idx = _orders.indexWhere((o) => o.id == orderId);
      if (idx != -1) _orders[idx] = updatedOrder;

      notifyListeners();
    });
  }

  void stopListeningToOrder() {
    _orderSubscription?.cancel();
    _orderSubscription = null;
    _listeningOrderId = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void clearError() {
    _errorMessage = null;
    _createError = null;
    notifyListeners();
  }

  void clearCurrentOrder() {
    _currentOrder = null;
    notifyListeners();
  }
}
