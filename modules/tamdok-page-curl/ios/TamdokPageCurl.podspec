Pod::Spec.new do |s|
  s.name           = 'TamdokPageCurl'
  s.version        = '1.0.0'
  s.summary        = 'Native page curl container for the paged reader'
  s.description    = 'Hosts React Native children as pages of a UIPageViewController (page curl).'
  s.author         = 'Tamdok'
  s.homepage       = 'https://github.com/Tamdok-MangaReader'
  s.license        = 'MIT'
  s.platform       = :ios, '16.0'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.{h,m,mm,swift}'
end
