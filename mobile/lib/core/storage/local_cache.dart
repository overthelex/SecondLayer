import 'package:hive_flutter/hive_flutter.dart';

class LocalCache {
  static const _conversationsBox = 'conversations';
  static const _decisionsBox = 'decisions';
  static const _legislationBox = 'legislation';

  Future<void> init() async {
    await Hive.initFlutter();
    await Hive.openBox(_conversationsBox);
    await Hive.openBox(_decisionsBox);
    await Hive.openBox(_legislationBox);
  }

  Box get conversations => Hive.box(_conversationsBox);
  Box get decisions => Hive.box(_decisionsBox);
  Box get legislation => Hive.box(_legislationBox);

  Future<void> clearAll() async {
    await conversations.clear();
    await decisions.clear();
    await legislation.clear();
  }
}
