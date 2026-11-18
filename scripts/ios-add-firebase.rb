# Adds GoogleService-Info.plist to the Xcode project (the file itself comes from a GitHub secret at build time).
require 'xcodeproj'
proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = proj.targets.find { |t| t.name == 'App' }
group = proj.main_group.find_subpath('App', false)
unless group.files.any? { |f| f.path == 'GoogleService-Info.plist' }
  ref = group.new_reference('GoogleService-Info.plist')
  target.resources_build_phase.add_file_reference(ref, true)
  proj.save
  puts 'Added GoogleService-Info.plist to the App target'
end
