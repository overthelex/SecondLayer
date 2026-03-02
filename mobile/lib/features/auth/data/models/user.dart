class User {
  final String id;
  final String email;
  final String name;
  final String? avatarUrl;
  final String? role;

  const User({
    required this.id,
    required this.email,
    required this.name,
    this.avatarUrl,
    this.role,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String? ?? json['user_id'] as String? ?? '',
        email: json['email'] as String? ?? '',
        name: json['name'] as String? ?? json['display_name'] as String? ?? '',
        avatarUrl: json['avatar_url'] as String? ?? json['picture'] as String?,
        role: json['role'] as String?,
      );
}
