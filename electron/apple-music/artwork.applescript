-- electron/apple-music/artwork.applescript
-- Export only the selected Music artwork into the application's private temporary directory.
on run argv
    set mediaID to item 1 of argv
    set mediaKind to item 2 of argv
    set outputPath to item 3 of argv
    tell application id "com.apple.Music"
        if mediaKind is "playlist" then
            set targetItem to first playlist whose persistent ID is mediaID
            try
                set imageBytes to raw data of artwork 1 of targetItem
            on error
                set imageBytes to raw data of artwork 1 of track 1 of targetItem
            end try
        else
            set targetItem to first track of library playlist 1 whose persistent ID is mediaID
            set imageBytes to raw data of artwork 1 of targetItem
        end if
    end tell
    set handle to open for access POSIX file outputPath with write permission
    try
        set eof handle to 0
        write imageBytes to handle
        close access handle
    on error errorMessage
        close access handle
        error errorMessage
    end try
    return outputPath
end run
