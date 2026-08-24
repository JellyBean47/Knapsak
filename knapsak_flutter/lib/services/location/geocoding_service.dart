import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geocoding/geocoding.dart';
import 'package:http/http.dart' as http;

/// Reverse-geocodes coordinates into a delivery-friendly address.
///
/// Prefers **"Town, Street"** (e.g. "Orania, Perellaan") using OpenStreetMap
/// street data. Falls back to town-only from BigDataCloud, avoiding municipality
/// names like "Thembelihle Local Municipality".
class GeocodingService {
  static const _bdcBase = 'https://api.bigdatacloud.net/data';
  static const _nominatimBase = 'https://nominatim.openstreetmap.org';

  /// Returns a display address, or [formatCoordinates] as fallback.
  static Future<String> reverseGeocode(
    double latitude,
    double longitude,
  ) async {
    try {
      final nominatim = await _fetchNominatim(latitude, longitude);
      if (nominatim != null) {
        final streetAddress = _formatNominatimDeliveryAddress(nominatim);
        if (streetAddress != null) return streetAddress;
      }

      final bdc = await _reverseGeocodeBigDataCloud(latitude, longitude);
      if (bdc != null) return bdc;

      if (!kIsWeb) {
        return await _reverseGeocodeNative(latitude, longitude);
      }

      return formatCoordinates(latitude, longitude);
    } catch (_) {
      return formatCoordinates(latitude, longitude);
    }
  }

  static String formatCoordinates(double latitude, double longitude) {
    return '${latitude.toStringAsFixed(4)}, ${longitude.toStringAsFixed(4)}';
  }

  static Future<Map<String, dynamic>?> _fetchNominatim(
    double latitude,
    double longitude,
  ) async {
    final uri = Uri.parse('$_nominatimBase/reverse').replace(
      queryParameters: {
        'lat': latitude.toString(),
        'lon': longitude.toString(),
        'format': 'json',
        'addressdetails': '1',
        'zoom': '18',
      },
    );

    final response = await http
        .get(
          uri,
          headers: const {'User-Agent': 'KnapsakFlutter/1.0'},
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode != 200) return null;
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Builds "Town, Street" from Nominatim address fields.
  static String? _formatNominatimDeliveryAddress(
    Map<String, dynamic> data,
  ) {
    final address = data['address'] as Map<String, dynamic>?;
    if (address == null) return null;

    final town = _extractTownName(address);
    final street = _nonEmptyString(address['road']);

    if (town != null && street != null) return '$town, $street';
    if (town != null) return town;
    if (street != null) return street;

    final displayName = data['display_name'] as String?;
    if (displayName != null) {
      return _parseDisplayName(displayName);
    }

    return null;
  }

  static String? _extractTownName(Map<String, dynamic> address) {
    return _firstClean(address, [
      'town',
      'township',
      'village',
      'hamlet',
      'city',
      'municipality',
      'locality',
    ]);
  }

  static String? _parseDisplayName(String displayName) {
    final parts = displayName
        .split(',')
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty && !_isAdminNoise(p) && !_isHouseNumber(p))
        .toList();

    if (parts.isEmpty) return null;

    // Typical SA format: "43, Jaspisstraat, Orania-Oos, ..., Orania, ..."
    final street = parts.length >= 2 && !_looksLikeTown(parts[0])
        ? parts[1]
        : null;

    final town = parts.reversed.firstWhere(
      (p) => _looksLikeTown(p) && !_isAdminNoise(p),
      orElse: () => '',
    );

    if (town.isNotEmpty && street != null && street != town) {
      return '$town, $street';
    }
    if (town.isNotEmpty) return town;

    return parts.length >= 2 ? '${parts[0]}, ${parts[1]}' : parts.first;
  }

  static bool _looksLikeTown(String value) {
    return !RegExp(r'^\d').hasMatch(value) &&
        !value.toLowerCase().contains('straat') &&
        !value.toLowerCase().contains('street') &&
        !value.toLowerCase().contains('road') &&
        !value.toLowerCase().contains('avenue') &&
        !value.toLowerCase().contains('lane');
  }

  static bool _isHouseNumber(String value) => RegExp(r'^\d+$').hasMatch(value);

  static Future<String?> _reverseGeocodeBigDataCloud(
    double latitude,
    double longitude,
  ) async {
    final uri = Uri.parse('$_bdcBase/reverse-geocode-client').replace(
      queryParameters: {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'localityLanguage': 'en',
      },
    );

    final response = await http
        .get(uri)
        .timeout(const Duration(seconds: 10));

    if (response.statusCode != 200) return null;

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return _formatBigDataCloud(data, latitude, longitude);
  }

  /// Town-only fallback — never append municipality as the second part.
  static String? _formatBigDataCloud(
    Map<String, dynamic> data,
    double latitude,
    double longitude,
  ) {
    final locality = _nonEmptyString(data['locality']);
    if (locality != null) return locality;

    final city = _nonEmptyString(data['city']);
    if (city != null && !_isAdminNoise(city)) return city;

    final subdivision = _nonEmptyString(data['principalSubdivision']);
    if (subdivision != null) return subdivision;

    return formatCoordinates(latitude, longitude);
  }

  static Future<String> _reverseGeocodeNative(
    double latitude,
    double longitude,
  ) async {
    final placemarks = await placemarkFromCoordinates(latitude, longitude);
    if (placemarks.isEmpty) {
      return formatCoordinates(latitude, longitude);
    }
    return _formatPlacemark(placemarks.first, latitude, longitude);
  }

  static String _formatPlacemark(
    Placemark place,
    double latitude,
    double longitude,
  ) {
    final street = _nonEmptyString(place.street) ??
        _nonEmptyString(place.thoroughfare);
    final town = _nonEmptyString(place.locality) ??
        _nonEmptyString(place.subAdministrativeArea) ??
        _nonEmptyString(place.subLocality);

    if (town != null && street != null && !_isAdminNoise(town)) {
      return '$town, $street';
    }
    if (town != null && !_isAdminNoise(town)) return town;
    if (street != null) return street;

    if (place.administrativeArea?.isNotEmpty == true) {
      return place.administrativeArea!;
    }

    return formatCoordinates(latitude, longitude);
  }

  static bool _isAdminNoise(String value) {
    final lower = value.toLowerCase();
    return lower.contains('municipality') ||
        lower.contains('district') ||
        lower.contains('metropolitan') ||
        lower.contains('ward') ||
        RegExp(r'\bward\s+\d+\b', caseSensitive: false).hasMatch(value);
  }

  static String? _nonEmptyString(dynamic value) {
    if (value is String && value.isNotEmpty) return value;
    return null;
  }

  static String? _firstClean(
    Map<String, dynamic> map,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = map[key];
      if (value is String && value.isNotEmpty && !_isAdminNoise(value)) {
        return value;
      }
    }
    return null;
  }
}
