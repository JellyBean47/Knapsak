import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:geolocator/geolocator.dart';
import '../models/address.dart';
import '../services/firebase/firestore_service.dart';
import '../services/location/geocoding_service.dart';

enum MovementStatus { unknown, stationary, walking, driving }

class DeliveryLocation {
  final String address;
  final double latitude;
  final double longitude;
  final double accuracy;
  final String? savedAddressName;
  final String? savedAddressId;

  const DeliveryLocation({
    required this.address,
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    this.savedAddressName,
    this.savedAddressId,
  });
}

class LocationProvider extends ChangeNotifier {
  final FirestoreService _firestore = FirestoreService();
  final FirebaseAuth _auth = FirebaseAuth.instance;

  DeliveryLocation? _currentLocation;
  DeliveryLocation? _deliveryLocation;
  List<SavedAddress> _savedAddresses = [];
  MovementStatus _movementStatus = MovementStatus.unknown;
  double _speed = 0.0;
  bool _isLoading = true;
  bool _isLoadingAddresses = false;
  String? _errorMsg;
  String? _addressError;
  StreamSubscription<Position>? _positionSubscription;

  LocationProvider() {
    _auth.authStateChanges().listen((user) {
      if (user != null) {
        fetchSavedAddresses();
      } else {
        _clearUserAddresses();
      }
    });
  }

  DeliveryLocation? get currentLocation  => _currentLocation;
  DeliveryLocation? get deliveryLocation => _deliveryLocation;
  List<SavedAddress> get savedAddresses  => _savedAddresses;
  MovementStatus get movementStatus      => _movementStatus;
  double get speed                       => _speed;
  bool get isLoading                     => _isLoading;
  bool get isLoadingAddresses            => _isLoadingAddresses;
  String? get errorMsg                   => _errorMsg;
  String? get addressError               => _addressError;
  bool get hasValidCurrentLocation =>
      _currentLocation != null &&
      _currentLocation!.address != 'Set your address';
  bool get isMoving =>
      _movementStatus == MovementStatus.walking ||
      _movementStatus == MovementStatus.driving;

  String get displayAddress {
    if (_deliveryLocation != null) return _deliveryLocation!.address;
    if (_currentLocation != null) return _currentLocation!.address;
    if (_savedAddresses.isNotEmpty) return _savedAddresses.first.address;
    if (_errorMsg != null) return 'Set your address';
    return 'Set your address';
  }

  Future<void> init() async {
    await _requestPermissionAndLocate();
  }

  /// Re-request permission and refresh GPS + geocoding.
  Future<void> refreshLocation() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    await _requestPermissionAndLocate();
  }

  Future<void> _requestPermissionAndLocate() async {
    _isLoading = true;
    _errorMsg = null;
    notifyListeners();

    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _errorMsg =
            'Location services are disabled. Enable them in device settings.';
        _applySavedAddressFallback();
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        _errorMsg =
            'Location permission blocked. Enable it in browser or app settings.';
        _applySavedAddressFallback();
        return;
      }

      if (permission == LocationPermission.denied) {
        _errorMsg = 'Location permission denied.';
        _applySavedAddressFallback();
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: kIsWeb
              ? LocationAccuracy.medium
              : LocationAccuracy.high,
          timeLimit: const Duration(seconds: 15),
        ),
      );

      await _processPosition(position);
      _errorMsg = null;
      _startPositionStream();
    } catch (e) {
      _errorMsg = kIsWeb
          ? 'Could not get your location. Allow location access in Chrome, or pick a saved address.'
          : 'Could not fetch your location. Please check your GPS.';
      _applySavedAddressFallback();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void _startPositionStream() {
    _positionSubscription?.cancel();
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy: kIsWeb
            ? LocationAccuracy.medium
            : LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen(
      (position) async => _processPosition(position),
      onError: (_) {},
    );
  }

  Future<void> _processPosition(Position position) async {
    _updateMovementStatus(position.speed);

    final addressStr = await GeocodingService.reverseGeocode(
      position.latitude,
      position.longitude,
    );

    _currentLocation = DeliveryLocation(
      address: addressStr,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
    );
    notifyListeners();
  }

  void _updateMovementStatus(double speedMs) {
    _speed = speedMs;
    if (speedMs > 5) {
      _movementStatus = MovementStatus.driving;
    } else if (speedMs > 1.5) {
      _movementStatus = MovementStatus.walking;
    } else {
      _movementStatus = MovementStatus.stationary;
    }
  }

  void confirmDeliveryLocation([DeliveryLocation? location]) {
    final target = location ?? _currentLocation;
    if (target == null) return;
    _deliveryLocation = target;
    _errorMsg = null;
    notifyListeners();
  }

  /// Sets delivery address from manual text entry (no GPS required).
  void setManualDeliveryAddress(String address) {
    if (address.trim().isEmpty) return;
    _deliveryLocation = DeliveryLocation(
      address: address.trim(),
      latitude: _currentLocation?.latitude ?? 0,
      longitude: _currentLocation?.longitude ?? 0,
      accuracy: 0,
    );
    _errorMsg = null;
    notifyListeners();
  }

  void selectSavedAddress(String addressId) {
    final addr = _savedAddresses.where((a) => a.id == addressId).firstOrNull;
    if (addr != null) {
      _deliveryLocation = DeliveryLocation(
        address: addr.address,
        latitude: addr.latitude,
        longitude: addr.longitude,
        accuracy: 5,
        savedAddressName: addr.name,
        savedAddressId: addr.id,
      );
      _errorMsg = null;
      notifyListeners();
    }
  }

  Future<void> fetchSavedAddresses() async {
    final user = _auth.currentUser;
    if (user == null) return;

    _isLoadingAddresses = true;
    _addressError = null;
    notifyListeners();

    try {
      _savedAddresses = await _firestore.getSavedAddresses(user.uid);
      _applySavedAddressFallback();
    } catch (_) {
      _addressError = 'Failed to load saved addresses.';
    }

    _isLoadingAddresses = false;
    notifyListeners();
  }

  /// When GPS fails, use the first saved address as delivery if none set.
  void _applySavedAddressFallback() {
    if (_deliveryLocation != null || _savedAddresses.isEmpty) return;
    final first = _savedAddresses.first;
    _deliveryLocation = DeliveryLocation(
      address: first.address,
      latitude: first.latitude,
      longitude: first.longitude,
      accuracy: 5,
      savedAddressName: first.name,
      savedAddressId: first.id,
    );
  }

  Future<bool> saveAddress(SavedAddress address) async {
    final user = _auth.currentUser;
    if (user == null) {
      _addressError = 'You must be logged in to save addresses.';
      notifyListeners();
      return false;
    }

    try {
      await _firestore.saveAddress(user.uid, address);
      _savedAddresses = [address, ..._savedAddresses];
      _addressError = null;
      notifyListeners();
      return true;
    } catch (_) {
      _addressError = 'Failed to save address.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteAddress(String addressId) async {
    final user = _auth.currentUser;
    if (user == null) {
      _addressError = 'You must be logged in to delete addresses.';
      notifyListeners();
      return false;
    }

    try {
      await _firestore.deleteAddress(user.uid, addressId);
      _savedAddresses =
          _savedAddresses.where((a) => a.id != addressId).toList();

      if (_deliveryLocation?.savedAddressId == addressId) {
        _deliveryLocation = null;
        _applySavedAddressFallback();
      }

      _addressError = null;
      notifyListeners();
      return true;
    } catch (_) {
      _addressError = 'Failed to delete address.';
      notifyListeners();
      return false;
    }
  }

  void _clearUserAddresses() {
    _savedAddresses = [];
    if (_deliveryLocation?.savedAddressId != null) {
      _deliveryLocation = null;
    }
    _addressError = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    super.dispose();
  }
}
