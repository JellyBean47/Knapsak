import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../navigation/app_router.dart';
import '../../providers/location_provider.dart';
import '../../utils/constants.dart';

class LocationSettingsScreen extends StatefulWidget {
  const LocationSettingsScreen({super.key});

  @override
  State<LocationSettingsScreen> createState() => _LocationSettingsScreenState();
}

class _LocationSettingsScreenState extends State<LocationSettingsScreen> {
  final _manualAddressController = TextEditingController();
  bool _showManualEntry = false;

  @override
  void dispose() {
    _manualAddressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final location = context.watch<LocationProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Location Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildCurrentLocationCard(context, location),
          const SizedBox(height: 16),
          if (location.deliveryLocation != null)
            _buildDeliveryAddressCard(location),
          const SizedBox(height: 16),
          _buildSavedAddressesCard(context, location),
          const SizedBox(height: 16),
          _buildManualEntryCard(context, location),
        ],
      ),
    );
  }

  Widget _buildCurrentLocationCard(
      BuildContext context, LocationProvider location) {
    final current = location.currentLocation;
    final hasCoords = current != null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Current Location',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                location.isLoading
                    ? Icons.gps_not_fixed
                    : hasCoords
                        ? Icons.location_on_outlined
                        : Icons.location_off_outlined,
                color: hasCoords ? AppColors.primary : AppColors.textSecondary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      location.isLoading
                          ? 'Fetching location...'
                          : current?.address ?? 'Location unavailable',
                      style: const TextStyle(color: AppColors.textPrimary),
                    ),
                    if (hasCoords && !location.isLoading) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${current.latitude.toStringAsFixed(4)}, '
                        '${current.longitude.toStringAsFixed(4)}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (location.errorMsg != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.accentLight,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline,
                      color: AppColors.accent, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      location.errorMsg!,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: location.isLoading
                      ? null
                      : () => location.refreshLocation(),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Refresh'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton.icon(
                  onPressed: location.isLoading || !location.hasValidCurrentLocation
                      ? null
                      : () {
                          location.confirmDeliveryLocation();
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Delivery address updated'),
                            ),
                          );
                        },
                  icon: const Icon(Icons.check),
                  label: const Text('Use as Delivery'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDeliveryAddressCard(LocationProvider location) {
    final delivery = location.deliveryLocation!;
    final label = delivery.savedAddressName ?? 'Delivery Address';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.primary),
      ),
      child: Row(
        children: [
          const Icon(Icons.home_outlined, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary)),
                Text(delivery.address,
                    style: const TextStyle(color: AppColors.textPrimary)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSavedAddressesCard(
      BuildContext context, LocationProvider location) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Saved Addresses',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          const SizedBox(height: 8),
          if (location.isLoadingAddresses)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: LinearProgressIndicator(color: AppColors.primary),
            )
          else if (location.savedAddresses.isEmpty)
            const Text(
              'No saved addresses yet. Add one for faster checkout.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            )
          else
            ...location.savedAddresses.map((addr) {
              final isSelected =
                  location.deliveryLocation?.savedAddressId == addr.id;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Text(addr.icon, style: const TextStyle(fontSize: 22)),
                title: Text(addr.name,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(addr.address, maxLines: 2),
                trailing: isSelected
                    ? const Icon(Icons.check_circle, color: AppColors.primary)
                    : null,
                onTap: () {
                  location.selectSavedAddress(addr.id);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Delivery set to ${addr.name}')),
                  );
                },
              );
            }),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.push(Routes.addressManagement),
              icon: const Icon(Icons.add_location_alt_outlined, size: 18),
              label: const Text('Manage Saved Addresses'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildManualEntryCard(
      BuildContext context, LocationProvider location) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => setState(() => _showManualEntry = !_showManualEntry),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Enter address manually',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 15)),
                ),
                Icon(
                  _showManualEntry
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  color: AppColors.textSecondary,
                ),
              ],
            ),
          ),
          if (_showManualEntry) ...[
            const SizedBox(height: 12),
            const Text(
              'Use this if GPS is unavailable or inaccurate.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _manualAddressController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Street address',
                hintText: 'e.g. 123 Main Rd, Cape Town',
                prefixIcon: Icon(Icons.edit_location_alt_outlined),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final text = _manualAddressController.text.trim();
                  if (text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Please enter an address')),
                    );
                    return;
                  }
                  location.setManualDeliveryAddress(text);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Delivery address saved')),
                  );
                },
                child: const Text('Save as Delivery Address'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
