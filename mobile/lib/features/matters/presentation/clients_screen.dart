import 'package:flutter/material.dart';

class ClientsScreen extends StatelessWidget {
  const ClientsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Клієнти')),
      body: const Center(child: Text('Клієнти — Phase 2')),
    );
  }
}
