class SavedAddress {
  final String id;
  final String name; // "Home", "Work", etc.
  final String address;
  final double latitude;
  final double longitude;
  final String icon;
  final DateTime createdAt;

  const SavedAddress({
    required this.id,
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
    this.icon = '📍',
    required this.createdAt,
  });

  factory SavedAddress.fromMap(Map<String, dynamic> map) {
    return SavedAddress(
      id: map['id'] as String,
      name: map['name'] as String,
      address: map['address'] as String,
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      icon: map['icon'] as String? ?? '📍',
      createdAt: DateTime.fromMillisecondsSinceEpoch(map['createdAt'] as int),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
      'icon': icon,
      'createdAt': createdAt.millisecondsSinceEpoch,
    };
  }
}
