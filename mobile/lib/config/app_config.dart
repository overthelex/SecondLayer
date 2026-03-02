class AppConfig {
  final String apiUrl;
  final String flavor;

  const AppConfig({
    required this.apiUrl,
    required this.flavor,
  });

  bool get isLocal => flavor == 'local';
  bool get isStage => flavor == 'stage';
  bool get isProd => flavor == 'prod';
}
